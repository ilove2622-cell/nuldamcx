import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  verifyWebhookSignature,
  sendMessage,
  getUserChat,
  getSignedFileUrl,
} from '@/lib/channeltalk-client';
import { pickPrimaryOrder, pickPrimarySearch } from '@/lib/order-parser';
import type { SearchCriteria } from '@/lib/order-parser';
import { lookupOrderBySabangnet, lookupOrder, formatOrderReply } from '@/lib/sabangnet-order-lookup';
import type { OrderSearchParams } from '@/lib/sabangnet-order-lookup';
import { generate } from '@/lib/llm-router';
import {
  escalate,
  shouldForceEscalate,
  hasEscalationKeyword,
} from '@/lib/escalation';
import { emojifyText } from '@/lib/emoji-utils';
import { checkBusinessHours, getNextBusinessDayISO } from '@/lib/business-hours';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CHANNEL_ID = process.env.CHANNELTALK_CHANNEL_ID || '';

// 설정 캐시 (60초 TTL)
let settingsCache: { mode: string; threshold: number; ts: number } | null = null;
const SETTINGS_TTL = 60_000;

async function getSettings(): Promise<{ mode: string; threshold: number }> {
  if (settingsCache && Date.now() - settingsCache.ts < SETTINGS_TTL) {
    return settingsCache;
  }
  try {
    const { data: modeRow } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'auto_reply_mode')
      .single();
    const { data: threshRow } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'confidence_threshold')
      .single();
    const mode = modeRow?.value ? String(modeRow.value).replace(/"/g, '') : (process.env.AUTO_REPLY_MODE || 'dryrun').trim();
    const threshold = threshRow?.value ? Number(threshRow.value) : (Number(process.env.AUTO_REPLY_CONFIDENCE_THRESHOLD) || 0.8);
    settingsCache = { mode, threshold, ts: Date.now() };
    return settingsCache;
  } catch {
    // DB 조회 실패 시 env fallback
    const fallback = {
      mode: (process.env.AUTO_REPLY_MODE || 'dryrun').trim(),
      threshold: Number(process.env.AUTO_REPLY_CONFIDENCE_THRESHOLD) || 0.8,
    };
    settingsCache = { ...fallback, ts: Date.now() };
    return fallback;
  }
}

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
  const text = await extractText(message);
  if (!text) return;

  // 봇/매니저 메시지는 기록만 하고 자동응답 플로우는 타지 않음
  if (personType !== 'user') {
    const session = await getOrCreateSession(userChatId, refers, message);
    const sender = personType === 'bot' ? 'bot' : 'agent';

    // 콘솔에서 발송한 봇 메시지가 webhook으로 돌아온 경우 중복 방지
    if (sender === 'bot') {
      const { data: recent } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('session_id', session.id)
        .eq('sender', 'bot')
        .eq('text', text)
        .gte('created_at', new Date(Date.now() - 30_000).toISOString())
        .limit(1);
      if (recent && recent.length > 0) {
        console.log(`⏩ 콘솔 발송 봇 메시지 중복 무시: ${message.id}`);
        return;
      }
    }

    // 중복 웹훅 방지: message_id가 같으면 무시
    const { error: dupErr } = await supabase.from('chat_messages').insert({
      session_id: session.id,
      sender,
      message_id: message.id,
      text,
    });
    if (dupErr && dupErr.code === '23505') {
      console.log(`⏩ 중복 메시지 무시: ${message.id}`);
      return;
    }
    const sessionUpdate: Record<string, any> = {
      last_message_at: new Date().toISOString(),
      last_message_text: text.slice(0, 100),
      last_message_sender: personType === 'manager' ? 'agent' : 'bot',
    };
    // manager 메시지 시 상담원 정보 저장
    if (personType === 'manager') {
      const agentId = message.personId || null;
      const agentName = refers.manager?.profile?.name || refers.manager?.name || null;
      if (agentId) {
        sessionUpdate.assigned_agent = agentId;
        sessionUpdate.assigned_agent_name = agentName;
      }
    }
    await supabase.from('chat_sessions').update(sessionUpdate).eq('id', session.id);
    console.log(`💬 ${sender} 메시지 기록 [${userChatId}]: ${text.slice(0, 80)}`);
    return;
  }

  console.log(`💬 고객 메시지 수신 [${userChatId}]: ${text.slice(0, 80)}...`);

  // 세션 조회/생성 (push 이벤트에서는 entity에서 정보 추출)
  const session = await getOrCreateSession(userChatId, refers, message);

  // 고객 메시지 DB 기록 (중복 웹훅 방지)
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

  if (msgErr) {
    if (msgErr.code === '23505') {
      console.log(`⏩ 중복 고객 메시지 무시: ${message.id}`);
      return;
    }
    console.error(`❌ 메시지 저장 실패:`, msgErr.message);
  }

  // 세션에 마지막 메시지 정보 업데이트
  await supabase.from('chat_sessions').update({
    last_message_at: new Date().toISOString(),
    last_message_text: text.slice(0, 100),
    last_message_sender: 'customer',
  }).eq('id', session.id);

  // 고객이 상담 종료한 경우 감지 ("OOO님이 상담을 종료하였습니다" 패턴)
  if (/님이 상담을 종료하였습니다/.test(text)) {
    await supabase.from('chat_sessions').update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      last_message_sender: 'system',
    }).eq('id', session.id);
    // sender를 system으로 변경
    await supabase.from('chat_messages').update({ sender: 'system' })
      .eq('session_id', session.id)
      .eq('channeltalk_message_id', message.id);
    console.log(`🔒 고객 상담 종료 감지: ${userChatId}`);
    return;
  }

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

  // Step 1: 검색 기준 감지 → 사방넷 조회 (주문번호/송장번호/전화번호)
  let orderContext = '';
  const search = pickPrimarySearch(fullCustomerText);
  if (search) {
    console.log(`🔍 검색 기준 감지: ${search.type} = ${search.value}`);
    try {
      let result;

      if (search.type === 'order_id') {
        // 기존 주문번호 조회 (하위호환)
        result = await lookupOrderBySabangnet(search.value);
      } else if (search.type === 'phone') {
        // 수취인/주문자 구분 불가 → receiver_tel 먼저, 없으면 orderer_tel 폴백
        result = await lookupOrder({ type: 'receiver_tel', value: search.value });
        if (!result.found) {
          result = await lookupOrder({ type: 'orderer_tel', value: search.value });
        }
      } else {
        // tracking_no, receiver_tel, orderer_tel
        result = await lookupOrder({ type: search.type, value: search.value });
      }

      if (result.found) {
        const product = result.productName + (result.optionName ? ` (${result.optionName})` : '');
        const tracking = result.courier && result.trackingNumber
          ? `택배사: ${result.courier}, 송장번호: ${result.trackingNumber}`
          : result.trackingNumber
            ? `송장번호: ${result.trackingNumber}`
            : '송장 미등록';
        const todayStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
        const searchLabel = search.type === 'order_id' ? '주문번호'
          : search.type === 'tracking_no' ? '송장번호'
          : search.type === 'receiver_tel' ? '수취인 전화번호'
          : search.type === 'orderer_tel' ? '주문자 전화번호'
          : '전화번호';
        orderContext = [
          `[사방넷 주문조회 결과]`,
          `검색기준: ${searchLabel} ${search.value}`,
          `주문번호: ${result.orderNumber}`,
          `수신자: ${result.receiverName || '미확인'}`,
          `배송지: ${result.receiverAddr || '미확인'}`,
          `상품: ${product}`,
          `주문상태(내부코드): ${result.status}`,
          result.orderDate ? `주문일: ${result.orderDate}` : '',
          result.shipDate ? `출고일: ${result.shipDate}` : '',
          `배송정보: ${tracking}`,
          result.itemCount && result.itemCount > 1 ? `총 ${result.itemCount}건 주문 (최근 주문 기준 표시)` : '',
          `오늘 날짜: ${todayStr}`,
        ].filter(Boolean).join('\n');
      } else {
        orderContext = `[사방넷 주문조회 결과]\n${search.type === 'order_id' ? '주문번호' : search.type} ${search.value}: 조회 결과 없음 (번호 확인 필요)`;
      }
    } catch (err) {
      console.warn('사방넷 조회 실패:', err);
      orderContext = `[사방넷 주문조회 결과]\n${search.value}: 조회 실패 (시스템 오류)`;
    }
  }

  // 동적 설정 로드
  const settings = await getSettings();
  const MODE = settings.mode;
  const CONFIDENCE_THRESHOLD = settings.threshold;

  // Step 2: 키워드 기반 무조건 에스컬레이션 체크
  if (hasEscalationKeyword(fullCustomerText)) {
    const bh = checkBusinessHours();
    await recordAndEscalate(session.id, msgRow?.id, userChatId, fullCustomerText, '키워드 감지 (환불/교환/취소/클레임 등)', undefined, MODE, !bh.isOpen);
    if (MODE === 'live') await sendEscalationGuide(userChatId, bh);
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
      const bh = checkBusinessHours();
      await recordAndEscalate(session.id, msgRow?.id, userChatId, fullCustomerText, `카테고리: ${llm.category}`, llm, MODE, !bh.isOpen);
      if (MODE === 'live') await sendEscalationGuide(userChatId, bh);
      return;
    }

    // LLM이 에스컬레이션 판단
    if (llm.escalate) {
      const bh = checkBusinessHours();
      await recordAndEscalate(session.id, msgRow?.id, userChatId, fullCustomerText, llm.reason, llm, MODE, !bh.isOpen);
      if (MODE === 'live') await sendEscalationGuide(userChatId, bh);
      return;
    }

    // 신뢰도 체크
    if (llm.confidence < CONFIDENCE_THRESHOLD) {
      const bh = checkBusinessHours();
      await recordAndEscalate(
        session.id, msgRow?.id, userChatId, fullCustomerText,
        `신뢰도 부족 (${llm.confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD})`,
        llm, MODE, !bh.isOpen
      );
      if (MODE === 'live') await sendEscalationGuide(userChatId, bh);
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
    }, MODE);
  } catch (err: any) {
    console.error('LLM 호출 실패:', err);
    const bh = checkBusinessHours();
    await recordAndEscalate(session.id, msgRow?.id, userChatId, fullCustomerText, `LLM 오류: ${err.message}`, undefined, MODE, !bh.isOpen);
    if (MODE === 'live') await sendEscalationGuide(userChatId, bh);
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

async function extractText(message: any): Promise<string> {
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

  // files 배열 처리 (push 이벤트 등에서 이미지/파일이 files로 전달됨)
  const files = message.files || [];
  const chatId = message.chatId || message.userChatId || '';
  for (const f of files) {
    // Supabase Storage에 업로드 시도
    const publicUrl = await tryUploadToStorage(f, chatId);

    if (f.type === 'image') {
      if (publicUrl) {
        parts.push(`[image:${publicUrl}]`);
      } else {
        // Supabase 업로드 실패 → 원본 URL이 있으면 그대로 사용
        const origUrl = getOriginalFileUrl(f);
        if (origUrl) {
          parts.push(`[image:${origUrl}]`);
        } else {
          const dims = f.width && f.height ? `${f.width}x${f.height}` : '';
          parts.push(`[photo:${chatId}:${f.id || ''}:${dims}:${f.name || ''}]`);
        }
      }
    } else if (f.type === 'video' || f.contentType?.startsWith('video/')) {
      if (publicUrl) {
        parts.push(`[video-url:${publicUrl}]`);
      } else {
        const origUrl = getOriginalFileUrl(f);
        if (origUrl) {
          parts.push(`[video-url:${origUrl}]`);
        } else {
          const dur = f.duration ? `${Math.round(f.duration)}초` : '';
          parts.push(`[video:${chatId}:${f.id || ''}:${dur}:${f.name || ''}]`);
        }
      }
    } else {
      const size = f.size ? `${(f.size / 1024).toFixed(0)}KB` : '';
      parts.push(`[file:${chatId}:${f.id || ''}:${size}:${f.name || '첨부파일'}]`);
    }
  }

  if (parts.length > 0) return emojifyText(parts.join('\n').trim());

  // plainText 폴백
  if (message.plainText) return emojifyText(message.plainText.trim());

  return '';
}

/** 채널톡 파일을 Supabase Storage에 업로드. 성공 시 공개 URL 반환, 실패 시 null */
async function tryUploadToStorage(file: any, chatId: string): Promise<string | null> {
  const ext = file.name?.split('.').pop() || (file.type === 'video' ? 'mp4' : 'jpg');
  const storagePath = `${chatId || 'unknown'}/${file.id || Date.now()}.${ext}`;

  // 다운로드 가능한 URL 목록 구성 (우선순위순)
  const urls: string[] = [];
  // 1. 채널톡 API signed URL (pri-file은 서명 필요)
  if (file.key && chatId) {
    const signedUrl = await getSignedFileUrl(chatId, file.key);
    if (signedUrl) urls.push(signedUrl);
  }
  // 2. 파일 객체의 url 필드
  if (file.url) urls.push(file.url);
  // 3. 채널톡 CDN 패턴 (pub-file만 작동, pri-file은 403)
  if (file.key && !file.key.startsWith('pri-')) urls.push(`https://cf.channel.io/${file.key}`);
  // 4. bucket/key 조합
  if (file.bucket && file.key && !file.key.startsWith('pri-')) {
    urls.push(`https://${file.bucket}/${file.key}`);
    urls.push(`https://${file.bucket}/${file.key}.${ext}`);
  }

  if (urls.length === 0) return null;

  for (const url of urls) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) continue;

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 100) continue; // 너무 작으면 에러 응답

      const { error } = await supabase.storage
        .from('chat-images')
        .upload(storagePath, buffer, {
          contentType: file.contentType || 'application/octet-stream',
          upsert: true,
        });

      if (error) {
        console.warn(`Storage 업로드 실패:`, error.message);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from('chat-images')
        .getPublicUrl(storagePath);

      console.log(`✅ 파일 업로드 성공: ${storagePath}`);
      return urlData.publicUrl;
    } catch (err: any) {
      console.warn(`파일 다운로드 시도 실패 (${url}):`, err.message);
    }
  }

  return null;
}

/** 채널톡 파일의 원본 URL 추출 (Supabase 업로드 실패 시 fallback용) */
function getOriginalFileUrl(file: any): string | null {
  if (file.url) return file.url;
  if (file.key) return `https://cf.channel.io/${file.key}`;
  return null;
}

async function getOrCreateSession(userChatId: string, refers: any, message?: any) {
  // 채널 유형과 고객 정보 확인
  let channelType = 'native';
  let customerName = refers.user?.profile?.name || null;
  try {
    const chatInfo = await getUserChat(userChatId);
    const rawType = chatInfo?.source?.appMessenger?.mediumType || chatInfo?.source?.medium?.mediumType;
    channelType = normalizeChannelType(rawType);
    if (!customerName && chatInfo?.name) customerName = chatInfo.name;
  } catch { /* ignore */ }

  // upsert로 경합 조건 방지
  const upsertData = {
    user_chat_id: userChatId,
    channel_type: channelType,
    customer_id: refers.user?.id || message?.personId || null,
    customer_name: customerName,
    status: 'open',
    opened_at: new Date().toISOString(),
  };

  const { data: upserted, error: upsertErr } = await supabase
    .from('chat_sessions')
    .upsert(upsertData, { onConflict: 'user_chat_id', ignoreDuplicates: false })
    .select('id, channel_type')
    .single();

  if (upsertErr) {
    // upsert 실패 시 기존 세션 조회 시도
    const { data: existing } = await supabase
      .from('chat_sessions')
      .select('id, channel_type')
      .eq('user_chat_id', userChatId)
      .single();
    if (existing) return existing;
    console.error(`❌ 세션 생성 실패:`, upsertErr.message);
    throw new Error(`세션 생성 실패: ${upsertErr.message}`);
  }

  return upserted!;
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
  meta: AIResponseMeta,
  MODE: string = 'dryrun'
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
  llm?: { model: string; answer: string; confidence: number; category: string; reason: string },
  MODE: string = 'dryrun',
  offHours: boolean = false
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

  // 실제 에스컬레이션
  if (MODE === 'live') {
    if (offHours) {
      // 상담시간 외: escalate() 호출 스킵 (봇 유지), snoozed 상태로 전환
      console.log(`🌙 에스컬레이션 보류 (상담시간 외): [${userChatId}] ${reason}`);
    } else {
      // 상담시간 내: 기존대로 봇 해제 + 상담원 배정
      await escalate(userChatId, reason, llm?.category);
      console.log(`🚨 에스컬레이션 (live): [${userChatId}] ${reason}`);
    }
  } else {
    console.log(`📝 에스컬레이션 (dryrun): [${userChatId}] ${reason}`);
  }

  // 세션 상태 업데이트
  if (offHours && MODE === 'live') {
    await supabase
      .from('chat_sessions')
      .update({
        status: 'snoozed',
        snoozed_until: getNextBusinessDayISO(),
      })
      .eq('id', sessionId);
  } else {
    await supabase
      .from('chat_sessions')
      .update({ status: 'escalated' })
      .eq('id', sessionId);
  }
}

/** 에스컬레이션 시 고객에게 안내 메시지 발송 */
async function sendEscalationGuide(
  userChatId: string,
  bh: { isOpen: boolean; nextOpenDesc: string }
) {
  try {
    if (bh.isOpen) {
      await sendMessage(
        userChatId,
        '해당 문의는 담당 상담원이 직접 확인해드려야 하는 사항입니다.\n상담원에게 연결해드리겠습니다. 잠시만 기다려주세요 😊'
      );
    } else {
      await sendMessage(
        userChatId,
        `해당 문의는 담당 상담원이 직접 확인해드려야 하는 사항입니다.\n\n현재는 상담 가능 시간이 아니에요.\n널담 상담 시간: 평일 10:00 ~ 17:00 (주말·공휴일 휴무)\n\n${bh.nextOpenDesc}에 상담원이 확인 후 답변드리겠습니다.\n접수된 내용은 저장되어 있으니 안심하세요! 😊`
      );
    }
  } catch (err) {
    console.warn('에스컬레이션 안내 메시지 발송 실패:', err);
  }
}
