import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { makeThumbnail } from '@/lib/voc-image';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

/**
 * 기존 사례 중 image_thumbnail이 비어있는 행에 대해 썸네일 생성·저장.
 * GET /api/voc/backfill-thumbnails?limit=20
 *
 * 한 번에 최대 limit건씩 처리 (기본 20). 응답이 빠르지만 전체 처리는 여러 번 호출 필요.
 * 운영 중에는 안전하게 작은 배치로 반복 호출 권장.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') || 20), 50);

    const { data: rows, error } = await supabase
      .from('substance_cases')
      .select('id, image_base64')
      .is('image_thumbnail', null)
      .not('image_base64', 'is', null)
      .limit(limit);

    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: true, processed: 0, remaining: 0, message: '백필 대상 없음' });
    }

    let processed = 0;
    let failed = 0;
    for (const row of rows) {
      const thumb = await makeThumbnail(row.image_base64);
      if (!thumb) {
        failed++;
        continue;
      }
      const { error: upErr } = await supabase
        .from('substance_cases')
        .update({ image_thumbnail: thumb })
        .eq('id', row.id);
      if (upErr) failed++;
      else processed++;
    }

    // 남은 건수 조회
    const { count } = await supabase
      .from('substance_cases')
      .select('*', { count: 'exact', head: true })
      .is('image_thumbnail', null)
      .not('image_base64', 'is', null);

    return NextResponse.json({
      success: true,
      processed,
      failed,
      remaining: count ?? 0,
      message: count ? `남은 ${count}건은 같은 URL을 다시 호출해 처리하세요.` : '✅ 모든 백필 완료',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '백필 실패';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
