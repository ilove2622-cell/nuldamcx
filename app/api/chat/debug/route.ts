import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const webhookToken = process.env.CHANNELTALK_WEBHOOK_TOKEN;
  const geminiKey = process.env.GEMINI_API_KEY;

  const results: Record<string, any> = {
    hasUrl: !!url,
    hasAnonKey: !!anonKey,
    hasServiceKey: !!serviceKey,
    urlPrefix: url?.slice(0, 30),
    anonKeyPrefix: anonKey?.slice(0, 20),
    hasWebhookToken: !!webhookToken,
    webhookTokenPrefix: webhookToken?.slice(0, 8),
    hasGeminiKey: !!geminiKey,
  };

  try {
    const sb = createClient(url!, serviceKey!);
    const { data: sessions, error: sErr } = await sb.from('chat_sessions').select('*').limit(5);
    results.sessionsCount = sessions?.length ?? 0;
    results.sessionsError = sErr?.message;
    results.sessions = sessions;

    const { data: ai, error: aErr } = await sb.from('ai_responses').select('*').limit(5);
    results.aiCount = ai?.length ?? 0;
    results.aiError = aErr?.message;
  } catch (e: any) {
    results.error = e.message;
  }

  return NextResponse.json(results);
}
