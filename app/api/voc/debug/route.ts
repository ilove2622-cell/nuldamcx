import { NextResponse } from 'next/server';
import { getCaseCount, getReferenceScripts } from '@/lib/voc-db';

export async function GET() {
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;

  try {
    const caseCount = await getCaseCount();
    const refScripts = await getReferenceScripts(5);
    return NextResponse.json({
      ok: true,
      hasGeminiKey,
      caseCount,
      referenceScriptCount: refScripts.length,
      referenceScripts: refScripts.map((s) => s.slice(0, 120)),
      startsWithGreeting: refScripts.filter((s) => s.startsWith('안녕하세요')).length,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      reason: err instanceof Error ? err.message : 'DB 조회 실패',
      hasGeminiKey,
    });
  }
}
