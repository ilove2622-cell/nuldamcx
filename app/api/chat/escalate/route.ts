import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { escalate } from '@/lib/escalation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/chat/escalate
 * 수동 에스컬레이션
 * body: { sessionId, userChatId, reason }
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId, userChatId, reason } = await req.json();

    if (!sessionId || !userChatId || !reason) {
      return NextResponse.json(
        { error: 'sessionId, userChatId, reason은 필수입니다' },
        { status: 400 }
      );
    }

    // 1. 채널톡 에스컬레이션 (봇 해제 + 태그 + 메모)
    await escalate(userChatId, reason, '수동에스컬레이션');

    // 2. escalations 테이블 기록
    await supabase.from('escalations').insert({
      session_id: sessionId,
      reason,
      category: '수동에스컬레이션',
    });

    // 3. 세션 상태 업데이트
    await supabase
      .from('chat_sessions')
      .update({ status: 'escalated' })
      .eq('id', sessionId);

    console.log(`🚨 수동 에스컬레이션: [${userChatId}] ${reason}`);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('❌ 에스컬레이션 실패:', err);
    return NextResponse.json(
      { error: err.message || '에스컬레이션 실패' },
      { status: 500 }
    );
  }
}
