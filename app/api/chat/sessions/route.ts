import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** GET /api/chat/sessions?days=7&status=open&channel=appKakao */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const days = Number(sp.get('days') || '7');
  const status = sp.get('status');
  const channel = sp.get('channel');

  const since = new Date(Date.now() - days * 86400000).toISOString();

  // last_message_at 정렬 시도, 컬럼 미존재 시 created_at fallback
  let q = supabase
    .from('chat_sessions')
    .select('*')
    .gte('created_at', since)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(500);

  if (status && status !== '전체') q = q.eq('status', status);
  if (channel && channel !== '전체') q = q.eq('channel_type', channel);

  let { data, error } = await q;

  // last_message_at 컬럼이 없으면 created_at으로 fallback
  if (error && error.message.includes('last_message_at')) {
    let fallback = supabase
      .from('chat_sessions')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500);

    if (status && status !== '전체') fallback = fallback.eq('status', status);
    if (channel && channel !== '전체') fallback = fallback.eq('channel_type', channel);

    const result = await fallback;
    data = result.data;
    error = result.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** PATCH /api/chat/sessions  — 세션 상태 변경 */
export async function PATCH(req: NextRequest) {
  try {
    const { sessionId, status } = await req.json();
    if (!sessionId || !status) {
      return NextResponse.json({ error: 'sessionId와 status는 필수' }, { status: 400 });
    }

    const { error } = await supabase
      .from('chat_sessions')
      .update({ status })
      .eq('id', sessionId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
