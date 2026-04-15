import { NextRequest, NextResponse } from 'next/server';
import { analyzeSubstance } from '@/lib/voc-gemini';
import { findSimilarCases, getReferenceScripts, findExactMatchCase } from '@/lib/voc-db';
import type { AnalyzeRequest, AnalyzeResponse, SimilarCase } from '@/types/voc';

export async function POST(req: NextRequest): Promise<NextResponse<AnalyzeResponse>> {
  try {
    const body: AnalyzeRequest & { substanceTypeHint?: string } = await req.json();
    const { imageBase64, mimeType, productName, substanceTypeHint } = body;

    if (!imageBase64 || !mimeType) {
      return NextResponse.json(
        { success: false, error: '이미지 데이터가 필요합니다.' },
        { status: 400 }
      );
    }

    // DB에서 과거 사례의 CS 스크립트를 항상 참조 (톤·스타일 학습)
    let referenceScripts: string[] | undefined;
    // 1순위: 힌트와 일치하는 사례 / 2순위: 일반 참조 스크립트
    if (substanceTypeHint) {
      const refCases = await findSimilarCases(substanceTypeHint, 'medium').catch(() => []);
      referenceScripts = refCases.map((c) => c.csScript).filter(Boolean).slice(0, 3);
    }
    if (!referenceScripts || referenceScripts.length === 0) {
      referenceScripts = await getReferenceScripts(5).catch(() => []);
    }

    // AI 분석
    const result = await analyzeSubstance(
      imageBase64,
      mimeType,
      productName,
      substanceTypeHint,
      referenceScripts
    );

    // 🎯 DB에 동일 이물질 사례가 이미 있으면 저장된 CS 스크립트를 재사용
    // (매번 AI가 조금씩 다른 문구를 만들어 일관성이 떨어지는 문제 해결)
    let matchedCaseId: number | undefined;
    const matched = await findExactMatchCase(result.substanceType).catch(() => null);
    if (matched && matched.csScript) {
      result.csScript = matched.csScript;
      matchedCaseId = matched.id;
    }

    // 유사 사례 검색 (분석 결과 기반) — 매칭된 원본 사례는 제외
    let similarCases: SimilarCase[] = [];
    similarCases = await findSimilarCases(
      result.substanceType,
      result.riskLevel,
      matchedCaseId
    ).catch(() => []);

    return NextResponse.json({
      success: true,
      data: result,
      similarCases,
      matchedCaseId,
    });

  } catch (err) {
    console.error('Analysis error:', err);
    const message = err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
