import type { AnalysisResult } from '@/types/voc';

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_ATTEMPTS = 4;

const SYSTEM_INSTRUCTION =
  "당신은 'Nuldam(널담)' 브랜드의 식품 이물질 분석 전문가이자 전문 CS 상담원입니다. " +
  'csScript 필드는 실제로 고객 게시판에 등록될 정중한 공식 답변 형식이어야 하며, ' +
  '"안녕하세요, Suggest the better 널 담입니다." 로 시작해 "감사합니다." 로 마무리합니다. ' +
  '반드시 JSON만 응답하세요. 마크다운, 설명, 추가 텍스트 없이 순수 JSON만 반환하세요.';

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
      ? `\n📚 [참고] 우리 회사의 실제 CS 응대 스크립트 예시입니다. 아래 예시의 톤과 표현을 참고하되, 반드시 아래 ✍️ csScript 작성 규칙을 우선 따르세요.

${referenceScripts.map((s, i) => `[예시 ${i + 1}]\n${s}`).join('\n\n')}\n`
      : '';
  return `${productInfo}${hintInfo}${refInfo}위 이미지에서 발견된 이물질을 분석해주세요. 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요.

✍️ csScript 작성 규칙 (게시판 답변 형식과 동일):
1. 반드시 첫 줄을 "안녕하세요, Suggest the better 널 담입니다." 로 시작하세요.
2. 그 다음 한 줄 띄우고 본문을 작성하세요.
3. 본문에는 다음 흐름을 자연스럽게 포함하세요:
   - 불편을 드린 점에 대한 진심 어린 사과
   - 사진 확인 결과(이물질 종류 추정)에 대한 안내
   - 발생 가능 원인에 대한 짧은 설명
   - 향후 재발 방지를 위한 조치 약속
   - (필요 시) 교환·환불·보상 안내 또는 추가 확인 요청
4. 마지막 줄은 "감사합니다." 로 마무리하세요.
5. 정중한 존댓말을 사용하고, 문장은 자연스럽게 줄바꿈(\\n)으로 구분하세요.
6. JSON 문자열 안의 줄바꿈은 반드시 \\n 으로 이스케이프하세요.

{
  "substanceType": "이물질 종류 (예: 금속 조각, 플라스틱, 곤충, 털 등)",
  "characteristics": "외관 특징 (색상, 크기 추정, 형태 등)",
  "riskLevel": "low | medium | high",
  "riskReason": "위험도 판단 근거",
  "estimatedSource": "혼입 추정 원인 (제조 공정, 원재료, 포장 등)",
  "recommendedActions": ["권장 조치 1", "권장 조치 2", "권장 조치 3"],
  "csScript": "안녕하세요, Suggest the better 널 담입니다.\\n\\n(사과)... (분석 결과 안내)... (원인 설명)... (재발 방지 약속)... (필요 시 보상 안내)...\\n\\n감사합니다."
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
