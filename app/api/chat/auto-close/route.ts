import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/chat/auto-close
 *
 * 상담 자동 종료: 마지막 메시지로부터 설정된 시간이 지난 open/escalated 세션을 자동 종료.
 * cron 또는 수동 호출 가능. 워크플로우와 별개로 동작.
 */
export async function POST(req: NextRequest) {
  try {
    // 설정 조회
    const { data: settingRow } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'auto_close')
      .maybeSingle();

    const config = settingRow?.value;
    if (!config?.enabled) {
      return NextResponse.json({ message: '자동 종료 비활성 상태', closed: 0 });
    }

    const hours = Number(config.hours) || 360;
    const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();

    // last_message_at이 cutoff 이전인 open/escalated 세션 조회
    const { data: sessions, error: fetchErr } = await supabase
      .from('chat_sessions')
      .select('id, user_chat_id, last_message_at, created_at')
      .in('status', ['open', 'escalated'])
      .or(`last_message_at.lt.${cutoff},and(last_message_at.is.null,created_at.lt.${cutoff})`);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ message: '종료할 세션 없음', closed: 0 });
    }

    const ids = sessions.map(s => s.id);
    const now = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from('chat_sessions')
      .update({ status: 'closed', closed_at: now })
      .in('id', ids);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      message: `${ids.length}건 자동 종료 완료`,
      closed: ids.length,
      sessionIds: ids,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
