import { NextRequest, NextResponse } from 'next/server';
import { saveCase } from '@/lib/voc-db';
import type { AnalysisResult } from '@/types/voc';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productName, result, imageBase64 } = body as {
      productName?: string;
      result: AnalysisResult;
      imageBase64?: string;
    };

    if (!result?.substanceType || !result?.csScript) {
      return NextResponse.json(
        { success: false, error: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      );
    }

    const id = await saveCase(productName, result, imageBase64);
    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error('Save case error:', err);
    const message = err instanceof Error ? err.message : '저장 실패';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
