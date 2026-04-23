import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** GET /api/chat/session-tags?sessionId=N */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ error: 'sessionId 필수' }, { status: 400 });

  const { data, error } = await supabase
    .from('session_tags')
    .select('*')
    .eq('session_id', Number(sessionId))
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tags: data || [] });
}

/** POST /api/chat/session-tags — { sessionId, label, category?, color? } */
export async function POST(req: NextRequest) {
  try {
    const { sessionId, label, category, color } = await req.json();
    if (!sessionId || !label) return NextResponse.json({ error: 'sessionId, label 필수' }, { status: 400 });

    const { data, error } = await supabase
      .from('session_tags')
      .insert({ session_id: sessionId, label, category: category || '일반', color: color || '#3b82f6' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ tag: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** DELETE /api/chat/session-tags — { tagId } */
export async function DELETE(req: NextRequest) {
  try {
    const { tagId } = await req.json();
    if (!tagId) return NextResponse.json({ error: 'tagId 필수' }, { status: 400 });

    const { error } = await supabase.from('session_tags').delete().eq('id', tagId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
