import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** GET /api/migrate — one-time migration for last_message columns */
export async function GET() {
  const results: string[] = [];

  // 1. Try adding columns by inserting a test update
  // Supabase JS doesn't support raw DDL, so we use a workaround:
  // Just try to update with the new columns - if they don't exist, we'll know

  // Test if column exists
  const { error: testErr } = await supabase
    .from('chat_sessions')
    .select('last_message_at')
    .limit(1);

  if (testErr && testErr.message.includes('last_message_at')) {
    results.push('columns do not exist yet - please run SQL in Supabase dashboard');
    return NextResponse.json({ results, needsManualSQL: true });
  }

  results.push('columns exist');

  // 2. Backfill: for each session without last_message_at, find latest message
  const { data: sessions } = await supabase
    .from('chat_sessions')
    .select('id')
    .is('last_message_at', null)
    .limit(1000);

  if (!sessions || sessions.length === 0) {
    results.push('no sessions need backfill');
    return NextResponse.json({ results });
  }

  let updated = 0;
  for (const s of sessions) {
    const { data: lastMsg } = await supabase
      .from('chat_messages')
      .select('created_at, text')
      .eq('session_id', s.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (lastMsg) {
      await supabase.from('chat_sessions').update({
        last_message_at: lastMsg.created_at,
        last_message_text: (lastMsg.text || '').slice(0, 100),
      }).eq('id', s.id);
      updated++;
    }
  }

  results.push(`backfilled ${updated}/${sessions.length} sessions`);
  return NextResponse.json({ results });
}
