import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/chat/notes?sessionId=N
 */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ error: 'sessionId 필수' }, { status: 400 });

  const { data, error } = await supabase
    .from('session_notes')
    .select('*')
    .eq('session_id', Number(sessionId))
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: data || [] });
}

/**
 * POST /api/chat/notes
 * body: { sessionId, text }
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId, text } = await req.json();
    if (!sessionId || !text) {
      return NextResponse.json({ error: 'sessionId, text 필수' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('session_notes')
      .insert({ session_id: sessionId, text })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ note: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/chat/notes
 * body: { noteId }
 */
export async function DELETE(req: NextRequest) {
  try {
    const { noteId } = await req.json();
    if (!noteId) return NextResponse.json({ error: 'noteId 필수' }, { status: 400 });

    const { error } = await supabase
      .from('session_notes')
      .delete()
      .eq('id', noteId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
