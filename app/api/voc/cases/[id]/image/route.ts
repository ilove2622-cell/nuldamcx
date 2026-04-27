import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * 사례의 원본 이미지(image_base64)를 lazy load.
 * 목록/유사 사례 카드는 썸네일만 받고, 사용자가 확대할 때만 이 엔드포인트를 호출.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const numId = Number(id);
    if (!Number.isFinite(numId)) {
      return NextResponse.json({ success: false, error: '잘못된 ID' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('substance_cases')
      .select('image_base64, image_thumbnail')
      .eq('id', numId)
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }

    // 원본이 없으면 썸네일이라도 반환
    return NextResponse.json({
      success: true,
      imageBase64: data?.image_base64 || data?.image_thumbnail || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '조회 실패';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
