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
  const limit = Math.min(Number(sp.get('limit') || '50'), 1000);

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

  // 세션 태그 + 고객 태그 일괄 조회
  const sessionIds = results.map((s: any) => s.id);
  const customerIds = [...new Set(results.map((s: any) => s.customer_id).filter(Boolean))] as string[];

  const [stRes, ctRes] = await Promise.all([
    sessionIds.length > 0
      ? supabase.from('session_tags').select('*').in('session_id', sessionIds)
      : Promise.resolve({ data: [] as any[] }),
    customerIds.length > 0
      ? supabase.from('customer_tags').select('*').in('customer_id', customerIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const sessionTagsMap = new Map<number, any[]>();
  for (const t of (stRes.data || [])) {
    const arr = sessionTagsMap.get(t.session_id) || [];
    arr.push(t);
    sessionTagsMap.set(t.session_id, arr);
  }

  const customerTagsMap = new Map<string, any[]>();
  for (const t of (ctRes.data || [])) {
    const arr = customerTagsMap.get(t.customer_id) || [];
    arr.push(t);
    customerTagsMap.set(t.customer_id, arr);
  }

  const enriched = results.map((s: any) => ({
    ...s,
    session_tags_data: sessionTagsMap.get(s.id) || [],
    customer_tags_data: s.customer_id ? (customerTagsMap.get(s.customer_id) || []) : [],
  }));

  // 기존 호환성: cursor 파라미터 없으면 배열 직접 반환
  if (!sp.has('cursor') && !sp.has('limit')) {
    return NextResponse.json(enriched);
  }

  return NextResponse.json({
    data: enriched,
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
