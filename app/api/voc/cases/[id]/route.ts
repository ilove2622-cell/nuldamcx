import { NextRequest, NextResponse } from 'next/server';
import { updateCase } from '@/lib/voc-db';
import type { AnalysisResult } from '@/types/voc';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caseId = parseInt(id, 10);
    if (Number.isNaN(caseId)) {
      return NextResponse.json({ success: false, error: '잘못된 ID' }, { status: 400 });
    }

    const body = await req.json();
    const { productName, result } = body as {
      productName?: string;
      result: AnalysisResult;
    };

    if (!result?.substanceType || !result?.csScript) {
      return NextResponse.json(
        { success: false, error: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      );
    }

    await updateCase(caseId, productName, result);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Update case error:', err);
    const message = err instanceof Error ? err.message : '수정 실패';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
