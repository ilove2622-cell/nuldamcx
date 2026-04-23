import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    const messages = msgs.data || [];
    const hasOlder = before ? messages.length === limit : false;

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
