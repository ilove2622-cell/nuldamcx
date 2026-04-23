import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/chat/handoff?timezone=Asia/Seoul
 *
 * 현재 시각 기준으로 AI 처리 여부를 반환.
 * - shouldHandoff: true → 기본 담당자에게 핸드오프
 * - shouldHandoff: false → AI 처리
 * - defaultAgent: 핸드오프 시 연결할 담당자
 *
 * 웹훅이나 자동응답 로직에서 호출하여 분기 판단에 사용.
 */
export async function GET(req: NextRequest) {
  try {
    const { data: row } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'handoff_schedule')
      .maybeSingle();

    if (!row?.value) {
      return NextResponse.json({ shouldHandoff: false, defaultAgent: 'auto', reason: '스케줄 미설정' });
    }

    const config = row.value as { grid: boolean[][]; timezone: string; defaultAgent: string };
    const tz = req.nextUrl.searchParams.get('timezone') || config.timezone || 'Asia/Seoul';

    // 현재 시각 → 해당 타임존의 요일/시
    const now = new Date();
    const formatted = now.toLocaleString('en-US', { timeZone: tz, hour12: false });
    const d = new Date(formatted);
    const dayIdx = d.getDay(); // 0=일
    const hour = d.getHours();

    const isAiSlot = config.grid?.[dayIdx]?.[hour] ?? false;

    return NextResponse.json({
      shouldHandoff: !isAiSlot,
      defaultAgent: config.defaultAgent || 'auto',
      currentSlot: { day: dayIdx, hour, timezone: tz, isAi: isAiSlot },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
