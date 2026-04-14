import type { AnalysisResult } from '@/types/voc';

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_ATTEMPTS = 4;

const SYSTEM_INSTRUCTION =
  '당신은 식품 이물질 분석 전문가입니다. 반드시 JSON만 응답하세요. 마크다운, 설명, 추가 텍스트 없이 순수 JSON만 반환하세요.';

function buildPrompt(
  productName?: string,
  substanceTypeHint?: string,
  referenceScripts?: string[]
): string {
  const productInfo = productName ? `제품명: ${productName}\n` : '';
  const hintInfo = substanceTypeHint
    ? `\n🚨 사용자가 이물질 종류를 "${substanceTypeHint}"(으)로 확정했습니다. substanceType은 정확히 이 값으로 설정하고, 나머지 모든 필드도 이 종류에 맞춰 일관되게 작성하세요.\n`
    : '';
  const refInfo =
    referenceScripts && referenceScripts.length > 0
      ? `\n📚 [필수 참고] 우리 회사의 실제 CS 응대 스크립트 예시입니다. csScript는 반드시 아래 예시들과 동일한 톤·인사말·구조·말투로 작성해야 합니다.

${referenceScripts.map((s, i) => `[예시 ${i + 1}]\n${s}`).join('\n\n')}

⚠️ csScript 작성 규칙:
- 위 예시처럼 시작 인사말("안녕하세요" 등)을 그대로 따라하세요.
- 사과 표현, 문장 구조, 종결어미, 존댓말 수준을 동일하게 유지하세요.
- 자체적으로 새로운 톤을 만들지 말고, 위 예시의 스타일을 그대로 복제해서 이번 상황에 맞게만 내용을 바꾸세요.\n`
      : '';
  return `${productInfo}${hintInfo}${refInfo}위 이미지에서 발견된 이물질을 분석해주세요. 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요.

{
  "substanceType": "이물질 종류 (예: 금속 조각, 플라스틱, 곤충, 털 등)",
  "characteristics": "외관 특징 (색상, 크기 추정, 형태 등)",
  "riskLevel": "low | medium | high",
  "riskReason": "위험도 판단 근거",
  "estimatedSource": "혼입 추정 원인 (제조 공정, 원재료, 포장 등)",
  "recommendedActions": ["권장 조치 1", "권장 조치 2", "권장 조치 3"],
  "csScript": "고객에게 전달할 정중한 CS 응대 멘트 (2-3문장)"
}`;
}

function parseResponse(text: string): AnalysisResult {
  const trimmed = text.trim();
  const jsonMatch =
    trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || trimmed.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : trimmed;
  try {
    return JSON.parse(jsonStr) as AnalysisResult;
  } catch {
    throw new Error('Failed to parse Gemini response as JSON');
  }
}

export async function analyzeSubstance(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
  productName?: string,
  substanceTypeHint?: string,
  referenceScripts?: string[]
): Promise<AnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: buildPrompt(productName, substanceTypeHint, referenceScripts) },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  };

  let lastError = '';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Gemini 응답에서 텍스트를 찾을 수 없습니다.');
        return parseResponse(text);
      }

      const errText = await res.text();
      lastError = `(${res.status}) ${errText}`;

      if (res.status === 429 || res.status === 503) {
        const match = errText.match(/"retryDelay"\s*:\s*"(\d+)s"/);
        const delaySec = match ? parseInt(match[1], 10) : 2 ** attempt;
        const waitMs = Math.min(delaySec * 1000 + 500, 20000);
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      break;
    }
  }
  throw new Error(
    `Gemini API 호출 실패: ${lastError}\n\n무료 할당량을 모두 사용했거나 일시적 과부하 상태입니다. 잠시 후 다시 시도해주세요.`
  );
}
