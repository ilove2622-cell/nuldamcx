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

  let q = supabase
    .from('chat_sessions')
    .select('*')
    .gte('created_at', since)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(500);

  if (status && status !== '전체') q = q.eq('status', status);
  if (channel && channel !== '전체') q = q.eq('channel_type', channel);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
