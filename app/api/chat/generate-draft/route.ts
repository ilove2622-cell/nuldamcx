import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { pickPrimarySearch } from '@/lib/order-parser';
import { lookupOrderBySabangnet, lookupOrder } from '@/lib/sabangnet-order-lookup';
import { generate } from '@/lib/llm-router';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/chat/generate-draft
 * 채팅 콘솔에서 AI 초안을 수동으로 (재)생성
 * body: { sessionId: number }
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId, extraContext } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId 필요' }, { status: 400 });
    }

    // 대화 이력 조회
    const { data: allMsgs } = await supabase
      .from('chat_messages')
      .select('id, sender, text, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    const msgList = allMsgs || [];
    if (msgList.length === 0) {
      return NextResponse.json({ error: '메시지가 없습니다' }, { status: 400 });
    }

    // 마지막 봇/상담사 답변 이후 고객 메시지
    let lastReplyIdx = -1;
    for (let i = msgList.length - 1; i >= 0; i--) {
      if (msgList[i].sender === 'bot' || msgList[i].sender === 'agent') {
        lastReplyIdx = i;
        break;
      }
    }

    const newCustomerMsgs = msgList
      .slice(lastReplyIdx + 1)
      .filter(m => m.sender === 'customer');

    // 고객 메시지가 없으면 전체 고객 메시지 사용
    const customerMsgs = newCustomerMsgs.length > 0
      ? newCustomerMsgs
      : msgList.filter(m => m.sender === 'customer');

    const fullCustomerText = customerMsgs.map(m => m.text).join('\n');
    if (!fullCustomerText.trim()) {
      return NextResponse.json({ error: '고객 메시지가 없습니다' }, { status: 400 });
    }

    // 인삿말 판단
    const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const hasRepliedToday = msgList.some(m =>
      (m.sender === 'bot' || m.sender === 'agent') &&
      new Date(new Date(m.created_at).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) === todayKST
    );

    // 사방넷 주문조회 (고객 메시지 + 참고 메모에서 주문번호 추출)
    let orderContext = '';
    const searchText = extraContext ? `${fullCustomerText}\n${extraContext}` : fullCustomerText;
    const search = pickPrimarySearch(searchText);
    if (search) {
      try {
        let result;
        if (search.type === 'order_id') {
          result = await lookupOrderBySabangnet(search.value);
        } else if (search.type === 'phone') {
          result = await lookupOrder({ type: 'receiver_tel', value: search.value });
          if (!result.found) {
            result = await lookupOrder({ type: 'orderer_tel', value: search.value });
          }
        } else {
          result = await lookupOrder({ type: search.type, value: search.value });
        }

        if (result.found) {
          const product = result.productName + (result.optionName ? ` (${result.optionName})` : '');
          const trackingDisplay = result.courier && result.trackingNumber
            ? `${result.courier} ${result.trackingNumber}`
            : result.trackingNumber
              ? result.trackingNumber
              : '송장 미등록';

          // 택배사 실시간 배송조회 (tracker.delivery API)
          let deliveryStatus = '';
          let deliverySteps = '';
          if (result.trackingNumber) {
            try {
              const trackNum = result.trackingNumber.replace(/[-\s]/g, '');
              const courierParam = encodeURIComponent(result.courier || '');
              const trackRes = await fetch(`https://nuldamcx.vercel.app/api/tracking?courierName=${courierParam}&num=${trackNum}`);
              if (trackRes.ok) {
                const trackData = await trackRes.json();
                deliveryStatus = trackData.currentStatus || '';
                if (trackData.steps && trackData.steps.length > 0) {
                  const recent = trackData.steps.slice(-3);
                  deliverySteps = recent.map((s: any) => `${s.date} ${s.location} - ${s.detail || s.step}`).join('\n');
                }
              }
            } catch { /* 조회 실패해도 무시 */ }
          }

          const todayStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
          orderContext = [
            `[주문조회 결과]`,
            `주문번호: ${result.orderNumber}`,
            `수신자: ${result.receiverName || '미확인'}`,
            `상품: ${product}`,
            result.orderDate ? `주문일: ${result.orderDate}` : '',
            result.shipDate ? `출고일: ${result.shipDate}` : '',
            `택배: ${trackingDisplay}`,
            deliveryStatus ? `[택배사 실시간 배송상태]: ${deliveryStatus}` : '',
            deliverySteps ? `[최근 배송이력]\n${deliverySteps}` : '',
            `오늘 날짜: ${todayStr}`,
          ].filter(Boolean).join('\n');
        }
      } catch { /* ignore */ }
    }

    // 대화 컨텍스트 구성
    const recentHistory = msgList.slice(-10).map(m => {
      const role = m.sender === 'customer' ? '고객' : m.sender === 'bot' ? 'AI 봇' : '상담사';
      return `${role}: ${m.text}`;
    }).join('\n');

    const contextParts: string[] = [];
    if (recentHistory) contextParts.push(`[대화 이력]\n${recentHistory}`);
    if (orderContext) contextParts.push(orderContext);
    if (hasRepliedToday) contextParts.push('[오늘 이미 답변한 적 있음 — 인삿말 생략]');
    if (extraContext && typeof extraContext === 'string' && extraContext.trim()) {
      contextParts.push(`[상담원 참고 메모]\n${extraContext.trim()}`);
    }

    // LLM 호출
    const llm = await generate(fullCustomerText, contextParts.join('\n\n'));

    // 이전 미발송 초안 삭제
    await supabase
      .from('ai_responses')
      .delete()
      .eq('session_id', sessionId)
      .is('sent_at', null);

    // 새 초안 저장
    const lastCustomerMsg = customerMsgs[customerMsgs.length - 1];
    await supabase.from('ai_responses').insert({
      session_id: sessionId,
      message_id: lastCustomerMsg?.id,
      model: llm.model,
      prompt: fullCustomerText,
      answer: llm.answer,
      confidence: llm.confidence,
      category: llm.category,
      escalate: llm.escalate,
      reason: llm.reason,
      mode: 'dryrun',
      sent_at: null,
    });

    return NextResponse.json({
      success: true,
      draft: {
        answer: llm.answer,
        confidence: llm.confidence,
        category: llm.category,
        escalate: llm.escalate,
        reason: llm.reason,
        model: llm.model,
      },
    });
  } catch (err: any) {
    console.error('AI 초안 생성 실패:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
