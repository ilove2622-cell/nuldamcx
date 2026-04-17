import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** GET /api/chat/messages?sessionId=1 — 메시지 + AI 응답 + 에스컬레이션 조회 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const sessionId = sp.get('sessionId');
  const days = Number(sp.get('days') || '1');

  // 세션별 상세 조회
  if (sessionId) {
    const [msgs, ai] = await Promise.all([
      supabase.from('chat_messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
      supabase.from('ai_responses').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
    ]);
    return NextResponse.json({
      messages: msgs.data || [],
      aiResponses: ai.data || [],
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
