import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
].filter(Boolean) as string[];

export type Category =
  | '주문조회' | '배송' | '환불' | '교환' | '취소'
  | '클레임' | '상품문의' | '기타';

export interface LLMResult {
  answer: string;
  confidence: number;    // 0 ~ 1
  category: Category;
  escalate: boolean;
  reason: string;        // 에스컬레이션 or 카테고리 판단 사유
  model: string;
}

const SYSTEM_PROMPT = `너는 'Nuldam(널담)' 브랜드의 채팅 CS 상담 AI야.
고객 메시지에 대해 JSON 형태로만 응답해야 해. 마크다운이나 부가 설명 없이 순수 JSON만 출력해.

반드시 아래 JSON 스키마를 따라:
{
  "answer": "고객에게 보낼 답변 (존댓말, 인사말은 '안녕하세요, Suggest the better 널 담입니다.'로 시작)",
  "confidence": 0.0~1.0 사이의 숫자 (답변 정확도에 대한 자신감),
  "category": "주문조회|배송|환불|교환|취소|클레임|상품문의|기타 중 하나",
  "escalate": true/false (상담사에게 넘겨야 하는지),
  "reason": "판단 근거 (내부용, 고객에게 안 보임)"
}

에스컬레이션 필수 조건 (escalate=true):
- 환불/교환/취소 요청
- 클레임 (파손, 오배송, 불량 등)
- 고객이 화가 나 있거나 강경한 태도
- 정확한 답변을 확신할 수 없을 때 (confidence < 0.8)

answer 작성 규칙:
- 인사말: "안녕하세요, Suggest the better 널 담입니다."
- 존댓말 사용
- 참고 스크립트가 있으면 그 정책을 따름
- 에스컬레이션 시에도 answer에 "담당자가 확인 후 안내드리겠습니다" 식의 임시 답변 작성`;

/**
 * Gemini 기반 LLM 라우터 — 멀티키 폴백 + RAG(match_scripts)
 */
export async function generate(
  customerMessage: string,
  context?: string
): Promise<LLMResult> {
  if (API_KEYS.length === 0) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  }

  let lastError: any = null;

  for (let i = 0; i < API_KEYS.length; i++) {
    const genAI = new GoogleGenerativeAI(API_KEYS[i]);

    try {
      // 1. Embedding → RAG
      const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
      const embeddingResult = await embeddingModel.embedContent(customerMessage);
      const queryEmbedding = embeddingResult.embedding.values.slice(0, 768);

      const { data: matchedScripts } = await supabase.rpc('match_scripts', {
        query_embedding: queryEmbedding,
        match_threshold: 0.3,
        match_count: 2,
      });

      let referenceText = '';
      if (matchedScripts && matchedScripts.length > 0) {
        referenceText = matchedScripts
          .map((s: any, idx: number) => `[참고 스크립트 ${idx + 1}: ${s.title}]\n${s.content}`)
          .join('\n\n');
      } else {
        referenceText = '일치하는 안내 스크립트가 없습니다. 일반적인 CS 기준으로 친절하게 답변해주세요.';
      }

      // 2. Generate
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: SYSTEM_PROMPT,
      });

      const prompt = [
        '[참고 스크립트]',
        referenceText,
        context ? `\n[추가 맥락]\n${context}` : '',
        `\n[고객 메시지]\n${customerMessage}`,
      ].join('\n');

      const aiResult = await model.generateContent(prompt);
      const raw = aiResult.response.text();

      // 3. Parse JSON
      const parsed = parseJSON(raw);

      return {
        answer: parsed.answer || '',
        confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
        category: parsed.category || '기타',
        escalate: Boolean(parsed.escalate),
        reason: parsed.reason || '',
        model: 'gemini-2.5-flash',
      };
    } catch (err: any) {
      lastError = err;
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('429') || msg.includes('quota') || msg.includes('exceeded')) {
        console.warn(`⚠️ LLM Router: ${i + 1}번째 키 한도 초과, 다음 키 시도`);
        continue;
      }
      throw err;
    }
  }

  throw new Error(`모든 Gemini API 키 한도 초과. 마지막 에러: ${lastError?.message}`);
}

function parseJSON(raw: string): any {
  // ```json ... ``` 블록 추출
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenced ? fenced[1].trim() : raw.trim();
  return JSON.parse(jsonStr);
}
