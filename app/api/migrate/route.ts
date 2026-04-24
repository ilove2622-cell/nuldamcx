import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** GET /api/migrate — one-time migration for last_message columns */
export async function GET() {
  const results: string[] = [];

  // 1. Test if last_message_at column exists
  const { error: testErr } = await supabase
    .from('chat_sessions')
    .select('last_message_at')
    .limit(1);

  if (testErr && testErr.message.includes('last_message_at')) {
    results.push('columns do not exist yet - please run SQL in Supabase dashboard');
    return NextResponse.json({ results, needsManualSQL: true });
  }

  results.push('last_message_at exists');

  // 2. Backfill last_message_at
  const { data: sessions } = await supabase
    .from('chat_sessions')
    .select('id')
    .is('last_message_at', null)
    .limit(1000);

  if (sessions && sessions.length > 0) {
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
    results.push(`backfilled last_message_at: ${updated}/${sessions.length}`);
  } else {
    results.push('last_message_at: no backfill needed');
  }

  // 3. Backfill last_message_sender
  const { error: senderTestErr } = await supabase
    .from('chat_sessions')
    .select('last_message_sender')
    .limit(1);

  if (senderTestErr && senderTestErr.message.includes('last_message_sender')) {
    results.push('last_message_sender column does not exist - run SQL: ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS last_message_sender TEXT;');
    return NextResponse.json({ results, needsManualSQL: true });
  }

  const { data: needsSender } = await supabase
    .from('chat_sessions')
    .select('id')
    .is('last_message_sender', null)
    .limit(1000);

  if (needsSender && needsSender.length > 0) {
    let updated = 0;
    for (const s of needsSender) {
      const { data: lastMsg } = await supabase
        .from('chat_messages')
        .select('sender')
        .eq('session_id', s.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (lastMsg) {
        await supabase.from('chat_sessions').update({
          last_message_sender: lastMsg.sender,
        }).eq('id', s.id);
        updated++;
      }
    }
    results.push(`backfilled last_message_sender: ${updated}/${needsSender.length}`);
  } else {
    results.push('last_message_sender: no backfill needed');
  }

  return NextResponse.json({ results });
}
