import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMessages as ctGetMessages } from '@/lib/channeltalk-client';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/chat/messages?sessionId=1 — 메시지 + AI 응답 조회
 * 커서: ?sessionId=1&before=<id>&limit=100
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const sessionId = sp.get('sessionId');
  const days = Number(sp.get('days') || '1');
  const before = sp.get('before'); // 메시지 ID 커서
  const limit = Math.min(Number(sp.get('limit') || '100'), 200);

  // 세션별 상세 조회
  if (sessionId) {
    let msgQ = supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (before) {
      msgQ = supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .lt('id', before)
        .order('created_at', { ascending: true })
        .limit(limit);
    }

    const [msgs, ai] = await Promise.all([
      msgQ,
      supabase.from('ai_responses').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
    ]);

    let messages = msgs.data || [];
    const hasOlder = before ? messages.length === limit : false;

    // Fallback: 메시지가 시스템 메시지만 있거나 0~1건이면 채널톡 API에서 동기화
    const realMessages = messages.filter((m: any) => m.sender !== 'system');
    if (!before && realMessages.length <= 1) {
      try {
        const { data: session } = await supabase
          .from('chat_sessions')
          .select('user_chat_id')
          .eq('id', sessionId)
          .single();

        if (session?.user_chat_id) {
          const ctMessages = await ctGetMessages(session.user_chat_id, 'asc', 100);

          if (ctMessages.length > 0) {
            const rows = ctMessages
              .filter((m: any) => !m.log) // 시스템 로그 제외
              .map((m: any) => {
                const text =
                  m.plainText ||
                  m.blocks?.map((b: any) => b.value || '').join('') ||
                  '';
                if (!text) return null;

                let sender = 'customer';
                if (m.personType === 'manager') sender = 'agent';
                else if (m.personType === 'bot') sender = 'bot';

                return {
                  session_id: Number(sessionId),
                  sender,
                  message_id: m.id,
                  text,
                };
              })
              .filter(Boolean);

            if (rows.length > 0) {
              // upsert: message_id unique constraint로 중복 방지
              await supabase
                .from('chat_messages')
                .upsert(rows, { onConflict: 'message_id', ignoreDuplicates: true });

              // DB에서 다시 조회
              const { data: refreshed } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true })
                .limit(limit);

              messages = refreshed || messages;
            }
          }
        }
      } catch (err) {
        console.error('채널톡 메시지 fallback 실패:', err);
        // fallback 실패 시 기존 결과 그대로 반환
      }
    }

    return NextResponse.json({
      messages,
      aiResponses: ai.data || [],
      ...(before ? { hasOlder } : {}),
    });
  }

  // 전체 AI 응답 + 에스컬레이션 (대시보드용)
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [ai, esc] = await Promise.all([
    supabase.from('ai_responses').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(1000),
    supabase.from('escalations').select('*').gte('created_at', since).limit(500),
  ]);

  return NextResponse.json({
    aiResponses: ai.data || [],
    escalations: esc.data || [],
  });
}
