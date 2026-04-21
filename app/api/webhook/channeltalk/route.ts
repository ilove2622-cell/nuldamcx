import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  verifyWebhookSignature,
  sendMessage,
  getUserChat,
} from '@/lib/channeltalk-client';
import { pickPrimaryOrder } from '@/lib/order-parser';
import { lookupOrderBySabangnet, formatOrderReply } from '@/lib/sabangnet-order-lookup';
import { generate } from '@/lib/llm-router';
import {
  escalate,
  shouldForceEscalate,
  hasEscalationKeyword,
} from '@/lib/escalation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CHANNEL_ID = process.env.CHANNELTALK_CHANNEL_ID || '';
const MODE = (process.env.AUTO_REPLY_MODE || 'dryrun').trim(); // dryrun | live
const CONFIDENCE_THRESHOLD = Number(process.env.AUTO_REPLY_CONFIDENCE_THRESHOLD) || 0.8;

/** 채널톡 웹훅 핸들러 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-signature') || '';

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const event = payload.event;
  const refers = payload.refers || {};

  // 웹훅 수신 로그 기록
  try {
    await supabase.from('webhook_logs').insert({
      event,
      signature_ok: false,
      body_preview: rawBody.slice(0, 500),
    });
  } catch { /* ignore */ }

  // 서명 검증: push 이벤트는 채널톡 내부 서명 방식이 다르므로 channelId로 검증
  const sigOk = verifyWebhookSignature(rawBody, signature);
  const isChannelTok = payload.entity?.channelId === CHANNEL_ID;

  if (!sigOk && !isChannelTok) {
    console.warn(`⚠️ 웹훅 검증 실패 — event: ${event}, channelId=${payload.entity?.channelId}, expected=${CHANNEL_ID}`);
    return NextResponse.json({ ok: true });
  }

  console.log(`📨 웹훅 [${event}] channelId=${payload.entity?.channelId}`);

  try {
    if (event === 'userChat.created') {
      await handleChatCreated(payload, refers);
    } else if (event === 'message.created' || event === 'push') {
      await handleMessageCreated(payload, refers);
    } else {
      console.log(`⏩ 미처리 이벤트: ${event}`);
    }
  } catch (err: any) {
    console.error(`❌ 웹훅 처리 오류 [${event}]:`, err);
  }

  // 채널톡은 항상 200 리턴 기대
  return NextResponse.json({ ok: true });
}

// ─── userChat.created: 새 채팅 생성 시 세션 기록 ───
async function handleChatCreated(payload: any, refers: any) {
  const userChat = payload.entity || {};
  const userChatId = userChat.id;
  if (!userChatId) return;

  const channelType = userChat.source?.appType || 'native';
  const userId = userChat.userId || refers.user?.id;
  const userName = refers.user?.profile?.name || null;

  await supabase.from('chat_sessions').upsert(
    {
      user_chat_id: userChatId,
      channel_type: channelType,
      customer_id: userId,
      customer_name: userName,
      status: 'open',
      opened_at: new Date().toISOString(),
    },
    { onConflict: 'user_chat_id' }
  );

  console.log(`📩 새 채팅 세션: ${userChatId} (${channelType})`);
}

// ─── message.created / push: 메시지 수신 시 자동응답 플로우 ───
async function handleMessageCreated(payload: any, refers: any) {
  const message = payload.entity || {};

  // 시스템 로그 메시지 무시 (채팅 오픈/종료 등)
  if (message.log) return;

  const userChatId = message.chatId || message.userChatId;
  if (!userChatId) return;

  // 텍스트 추출
  const personType = message.personType;
  const text = extractText(message);
  if (!text) return;

  // 봇/매니저 메시지는 기록만 하고 자동응답 플로우는 타지 않음
  if (personType !== 'user') {
    const session = await getOrCreateSession(userChatId, refers, message);
    const sender = personType === 'bot' ? 'bot' : 'agent';
    await supabase.from('chat_messages').insert({
      session_id: session.id,
      sender,
      message_id: message.id,
      text,
    });
    console.log(`💬 ${sender} 메시지 기록 [${userChatId}]: ${text.slice(0, 80)}`);
    return;
  }

  console.log(`💬 고객 메시지 수신 [${userChatId}]: ${text.slice(0, 80)}...`);

  // 세션 조회/생성 (push 이벤트에서는 entity에서 정보 추출)
  const session = await getOrCreateSession(userChatId, refers, message);

  // 고객 메시지 DB 기록
  const { data: msgRow, error: msgErr } = await supabase
    .from('chat_messages')
    .insert({
      session_id: session.id,
      sender: 'customer',
      message_id: message.id,
      text,
    })
    .select('id')
    .single();

  if (msgErr) console.error(`❌ 메시지 저장 실패:`, msgErr.message);

  // ─── 플로우 시작 ───

  // 마지막 봇/상담사 답변 이후 고객 메시지를 모아서 확인
  const { data: allMsgs } = await supabase
    .from('chat_messages')
    .select('id, sender, text, created_at')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true });

  const msgList = allMsgs || [];

  // 마지막 봇/상담사 답변 위치 찾기
  let lastReplyIdx = -1;
  for (let i = msgList.length - 1; i >= 0; i--) {
    if (msgList[i].sender === 'bot' || msgList[i].sender === 'agent') {
      lastReplyIdx = i;
      break;
    }
  }

  // 마지막 답변 이후 고객 메시지들
  const newCustomerMsgs = msgList
    .slice(lastReplyIdx + 1)
    .filter(m => m.sender === 'customer');

  // 전체 고객 메시지 텍스트 (LLM에 전달할 컨텍스트)
  const fullCustomerText = newCustomerMsgs.map(m => m.text).join('\n');

  // 오늘 날짜(KST) 기준 이미 답변한 적 있는지 확인 (인삿말 판단용)
  const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const hasRepliedToday = msgList.some(m =>
    (m.sender === 'bot' || m.sender === 'agent') &&
    new Date(new Date(m.created_at).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) === todayKST
  );

  // Step 1: 주문번호 감지 → 사방넷 조회 (결과를 LLM 컨텍스트로 전달)
  let orderContext = '';
  const order = pickPrimaryOrder(fullCustomerText);
  if (order) {
    console.log(`🔍 주문번호 감지: ${order.orderNumber} (${order.mall})`);
    try {
      const result = await lookupOrderBySabangnet(order.orderNumber);
      if (result.found) {
        const product = result.productName + (result.optionName ? ` (${result.optionName})` : '');
        const tracking = result.courier && result.trackingNumber
          ? `택배사: ${result.courier}, 송장번호: ${result.trackingNumber}`
          : result.trackingNumber
            ? `송장번호: ${result.trackingNumber}`
            : '송장 미등록';
        // 오늘 KST 날짜
        const todayStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
        orderContext = [
          `[사방넷 주문조회 결과]`,
          `주문번호: ${result.orderNumber}`,
          `수신자: ${result.receiverName || '미확인'}`,
          `배송지: ${result.receiverAddr || '미확인'}`,
          `상품: ${product}`,
          `주문상태(내부코드): ${result.status}`,
          result.orderDate ? `주문일: ${result.orderDate}` : '',
          result.shipDate ? `출고일: ${result.shipDate}` : '',
          `배송정보: ${tracking}`,
          result.itemCount && result.itemCount > 1 ? `총 ${result.itemCount}건 주문` : '',
          `오늘 날짜: ${todayStr}`,
        ].filter(Boolean).join('\n');
      } else {
        orderContext = `[사방넷 주문조회 결과]\n주문번호 ${order.orderNumber}: 조회 결과 없음 (번호 확인 필요)`;
      }
    } catch (err) {
      console.warn('사방넷 조회 실패:', err);
      orderContext = `[사방넷 주문조회 결과]\n주문번호 ${order.orderNumber}: 조회 실패 (시스템 오류)`;
    }
  }

  // Step 2: 키워드 기반 무조건 에스컬레이션 체크
  if (hasEscalationKeyword(fullCustomerText)) {
    await recordAndEscalate(session.id, msgRow?.id, userChatId, fullCustomerText, '키워드 감지 (환불/교환/취소/클레임 등)');
    return;
  }

  // Step 3: LLM 호출 (대화 이력 + 주문정보 + 인삿말 여부 전달)
  try {
    // 이전 대화 맥락 구성 (최근 10건)
    const recentHistory = msgList.slice(-10).map(m => {
      const role = m.sender === 'customer' ? '고객' : m.sender === 'bot' ? 'AI 봇' : '상담사';
      return `${role}: ${m.text}`;
    }).join('\n');

    const contextParts: string[] = [];
    if (recentHistory) contextParts.push(`[대화 이력]\n${recentHistory}`);
    if (orderContext) contextParts.push(orderContext);
    if (hasRepliedToday) contextParts.push('[오늘 이미 답변한 적 있음 — 인삿말 생략]');

    const llm = await generate(fullCustomerText, contextParts.join('\n\n'));

    // 무조건 에스컬레이션 카테고리
    if (shouldForceEscalate(llm.category)) {
      await recordAndEscalate(session.id, msgRow?.id, userChatId, fullCustomerText, `카테고리: ${llm.category}`, llm);
      return;
    }

    // LLM이 에스컬레이션 판단
    if (llm.escalate) {
      await recordAndEscalate(session.id, msgRow?.id, userChatId, fullCustomerText, llm.reason, llm);
      return;
    }

    // 신뢰도 체크
    if (llm.confidence < CONFIDENCE_THRESHOLD) {
      await recordAndEscalate(
        session.id, msgRow?.id, userChatId, fullCustomerText,
        `신뢰도 부족 (${llm.confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD})`,
        llm
      );
      return;
    }

    // 안전 → 자동응답
    await recordAndSend(session.id, msgRow?.id, userChatId, llm.answer, {
      model: llm.model,
      prompt: fullCustomerText,
      confidence: llm.confidence,
      category: llm.category,
      escalate: false,
      reason: llm.reason,
    });
  } catch (err: any) {
    console.error('LLM 호출 실패:', err);
    await recordAndEscalate(session.id, msgRow?.id, userChatId, fullCustomerText, `LLM 오류: ${err.message}`);
  }
}

// ─── 헬퍼 함수들 ───

/** 채널 유형을 카카오톡/네이버톡톡/채널톡 3가지로 정규화 */
function normalizeChannelType(raw: string | undefined | null): string {
  if (!raw) return 'native';
  if (raw.includes('Kakao') || raw.includes('kakao')) return 'appKakao';
  if (raw.includes('Naver') || raw.includes('naver')) return 'appNaverTalk';
  return 'native'; // 채널톡
}

function extractText(message: any): string {
  // blocks 배열에서 text + 이미지/파일 추출
  const blocks = message.blocks || [];
  const parts: string[] = [];

  for (const b of blocks) {
    if (b.type === 'text' && b.value) {
      parts.push(b.value);
    } else if (b.type === 'image' || b.type === 'file') {
      const url = b.url || b.value || '';
      const name = b.filename || b.name || '';
      if (url) {
        parts.push(b.type === 'image' ? `[image:${url}]` : `[file:${name || url}]`);
      }
    } else if (b.type === 'button' && b.value) {
      parts.push(`[버튼: ${b.value}]`);
    }
  }

  if (parts.length > 0) return parts.join('\n').trim();

  // plainText 폴백
  if (message.plainText) return message.plainText.trim();

  return '';
}

async function getOrCreateSession(userChatId: string, refers: any, message?: any) {
  const { data: existing, error: findErr } = await supabase
    .from('chat_sessions')
    .select('id, channel_type')
    .eq('user_chat_id', userChatId)
    .single();

  if (existing) {
    // 기존 세션의 channel_type이 부정확하면 API로 갱신
    if (!['appKakao', 'appNaverTalk', 'native'].includes(existing.channel_type)) {
      try {
        const chatInfo = await getUserChat(userChatId);
        const rawType = chatInfo?.source?.appMessenger?.mediumType || chatInfo?.source?.medium?.mediumType;
        const normalized = normalizeChannelType(rawType);
        if (normalized !== existing.channel_type) {
          await supabase.from('chat_sessions').update({ channel_type: normalized }).eq('id', existing.id);
        }
      } catch { /* ignore */ }
    }
    return existing;
  }
  if (findErr) console.log(`세션 조회 결과: ${findErr.message} (정상 — 새 세션 생성)`);

  // push 이벤트에서는 refers가 비어있으므로, 채널톡 API로 채팅 정보 조회
  let channelType = 'native';
  let customerName = refers.user?.profile?.name || null;
  try {
    const chatInfo = await getUserChat(userChatId);
    const rawType = chatInfo?.source?.appMessenger?.mediumType || chatInfo?.source?.medium?.mediumType;
    channelType = normalizeChannelType(rawType);
    if (!customerName && chatInfo?.name) customerName = chatInfo.name;
  } catch { /* ignore */ }

  const insertData = {
    user_chat_id: userChatId,
    channel_type: channelType,
    customer_id: refers.user?.id || message?.personId || null,
    customer_name: customerName,
    status: 'open',
    opened_at: new Date().toISOString(),
  };
  console.log(`📝 세션 생성 시도:`, JSON.stringify(insertData));

  const { data: created, error: insertErr } = await supabase
    .from('chat_sessions')
    .insert(insertData)
    .select('id')
    .single();

  if (insertErr) {
    console.error(`❌ 세션 생성 실패:`, insertErr.message, insertErr.details, insertErr.hint);
    throw new Error(`세션 생성 실패: ${insertErr.message}`);
  }

  console.log(`✅ 세션 생성 완료: id=${created!.id}`);
  return created!;
}

interface AIResponseMeta {
  model: string;
  prompt: string;
  confidence: number;
  category: string;
  escalate: boolean;
  reason: string;
}

async function recordAndSend(
  sessionId: number,
  messageId: number | undefined,
  userChatId: string,
  answer: string,
  meta: AIResponseMeta
) {
  // 이전 미발송 초안 삭제 (최신 초안으로 교체)
  await supabase
    .from('ai_responses')
    .delete()
    .eq('session_id', sessionId)
    .is('sent_at', null);

  const sentAt = MODE === 'live' ? new Date().toISOString() : null;

  await supabase.from('ai_responses').insert({
    session_id: sessionId,
    message_id: messageId,
    model: meta.model,
    prompt: meta.prompt,
    answer,
    confidence: meta.confidence,
    category: meta.category,
    escalate: meta.escalate,
    reason: meta.reason,
    mode: MODE,
    sent_at: sentAt,
  });

  if (MODE === 'live') {
    await sendMessage(userChatId, answer);
    console.log(`✅ 자동응답 발송: [${userChatId}] ${answer.slice(0, 50)}...`);
  } else {
    console.log(`📝 드라이런 기록: [${userChatId}] ${answer.slice(0, 50)}...`);
  }
}

async function recordAndEscalate(
  sessionId: number,
  messageId: number | undefined,
  userChatId: string,
  customerText: string,
  reason: string,
  llm?: { model: string; answer: string; confidence: number; category: string; reason: string }
) {
  // 이전 미발송 초안 삭제 (최신 초안으로 교체)
  await supabase
    .from('ai_responses')
    .delete()
    .eq('session_id', sessionId)
    .is('sent_at', null);

  // AI 응답 기록 (있으면)
  if (llm) {
    await supabase.from('ai_responses').insert({
      session_id: sessionId,
      message_id: messageId,
      model: llm.model,
      prompt: customerText,
      answer: llm.answer,
      confidence: llm.confidence,
      category: llm.category,
      escalate: true,
      reason,
      mode: MODE,
      sent_at: null,
    });
  }

  // 에스컬레이션 기록
  await supabase.from('escalations').insert({
    session_id: sessionId,
    reason,
    category: llm?.category || '기타',
  });

  // 실제 에스컬레이션 (드라이런이어도 기록은 함, 채널톡 API 호출만 분기)
  if (MODE === 'live') {
    await escalate(userChatId, reason, llm?.category);
    console.log(`🚨 에스컬레이션 (live): [${userChatId}] ${reason}`);
  } else {
    console.log(`📝 에스컬레이션 (dryrun): [${userChatId}] ${reason}`);
  }

  // 세션 상태 업데이트
  await supabase
    .from('chat_sessions')
    .update({ status: 'escalated' })
    .eq('id', sessionId);
}
