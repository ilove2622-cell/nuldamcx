import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/chat/sessions?days=7&status=open&channel=appKakao
 * 커서 기반 페이지네이션: ?cursor=<ISO>&limit=50
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const days = Number(sp.get('days') || '7');
  const status = sp.get('status');
  const channel = sp.get('channel');
  const cursor = sp.get('cursor');
  const limit = Math.min(Number(sp.get('limit') || '50'), 100);

  const since = new Date(Date.now() - days * 86400000).toISOString();

  let q = supabase
    .from('chat_sessions')
    .select('*')
    .gte('created_at', since)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit + 1); // +1로 다음 페이지 존재 여부 확인

  if (status && status !== '전체') q = q.eq('status', status);
  if (channel && channel !== '전체') q = q.eq('channel_type', channel);
  if (cursor) q = q.lt('last_message_at', cursor);

  let { data, error } = await q;

  // last_message_at 컬럼이 없으면 created_at으로 fallback
  if (error && error.message.includes('last_message_at')) {
    let fallback = supabase
      .from('chat_sessions')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (status && status !== '전체') fallback = fallback.eq('status', status);
    if (channel && channel !== '전체') fallback = fallback.eq('channel_type', channel);
    if (cursor) fallback = fallback.lt('created_at', cursor);

    const result = await fallback;
    data = result.data;
    error = result.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = data || [];
  const hasMore = items.length > limit;
  const results = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore
    ? (results[results.length - 1]?.last_message_at || results[results.length - 1]?.created_at)
    : null;

  // 기존 호환성: cursor 파라미터 ���으면 배열 직접 반환
  if (!sp.has('cursor') && !sp.has('limit')) {
    return NextResponse.json(results);
  }

  return NextResponse.json({
    data: results,
    nextCursor,
    hasMore,
  });
}

/** PATCH /api/chat/sessions  — 세션 상태 변경 */
export async function PATCH(req: NextRequest) {
  try {
    const { sessionId, status, snoozedUntil } = await req.json();
    if (!sessionId || !status) {
      return NextResponse.json({ error: 'sessionId와 status는 필수' }, { status: 400 });
    }

    const updateData: Record<string, any> = { status };
    if (status === 'closed') {
      updateData.closed_at = new Date().toISOString();
      updateData.snoozed_until = null;
    } else if (status === 'snoozed' && snoozedUntil) {
      updateData.snoozed_until = snoozedUntil;
    } else {
      // open / escalated → 스누즈 해제
      updateData.snoozed_until = null;
    }

    const { error } = await supabase
      .from('chat_sessions')
      .update(updateData)
      .eq('id', sessionId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
