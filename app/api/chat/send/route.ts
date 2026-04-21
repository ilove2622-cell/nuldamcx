import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendMessage } from '@/lib/channeltalk-client';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/chat/send
 * AI 초안을 채널톡으로 실제 발송
 * body: { userChatId, text, aiResponseId? }
 */
export async function POST(req: NextRequest) {
  try {
    const { userChatId, text, aiResponseId } = await req.json();

    if (!userChatId || !text) {
      return NextResponse.json(
        { error: 'userChatId와 text는 필수입니다' },
        { status: 400 }
      );
    }

    // 1. 채널톡 메시지 발송
    await sendMessage(userChatId, text);

    // 2. ai_responses.sent_at 업데이트 (드라이런 → 발송 완료)
    if (aiResponseId) {
      await supabase
        .from('ai_responses')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', aiResponseId);
    }

    // 3. chat_messages에 봇 메시지 기록
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('user_chat_id', userChatId)
      .single();

    if (session) {
      await supabase.from('chat_messages').insert({
        session_id: session.id,
        sender: 'bot',
        text,
      });
      await supabase.from('chat_sessions').update({
        last_message_at: new Date().toISOString(),
        last_message_text: text.slice(0, 100),
      }).eq('id', session.id);
    }

    console.log(`✅ 수동 발송 완료: [${userChatId}] ${text.slice(0, 50)}...`);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('❌ 메시지 발송 실패:', err);
    return NextResponse.json(
      { error: err.message || '발송 실패' },
      { status: 500 }
    );
  }
}
