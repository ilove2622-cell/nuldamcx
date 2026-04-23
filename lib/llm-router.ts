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

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

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
  "answer": "고객에게 보낼 답변",
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
- 존댓말 사용
- 참고 스크립트가 있으면 그 정책을 따름
- 에스컬레이션 시에도 answer에 "담당자가 확인 후 안내드리겠습니다" 식의 임시 답변 작성
- 고객 메시지가 여러 건이면 전체 내용을 종합해서 하나의 답변을 작성
- 사방넷 주문조회 결과가 컨텍스트에 있으면 그 정보를 활용해 답변 (상품명, 배송정보 등을 자연스럽게 안내)
- 주문조회 결과가 없으면(조회 실패/결과 없음) 고객에게 주문번호 재확인을 요청
- 사방넷 "주문상태(내부코드)" 값은 내부 물류 코드이므로 고객에게 그대로 노출하지 말 것
  - 주문상태 코드 자체("출고대기", "신규주문" 등)를 답변에 직접 쓰지 말고, 고객이 이해할 수 있는 표현으로 바꿔서 안내
  - "출고대기" = 송장 입력이 완료된 상태 → 취소/변경 불가
    - 출고일 또는 출고대기 전환일이 오늘이면: "발송 준비가 완료되어 곧 출고될 예정"으로 안내
    - 출고일이 어제 이전이면: "이미 출고된 상품으로 배송 진행 중"으로 안내
    - 송장번호가 있으면 송장번호도 함께 안내

오안내 정정 규칙:
- 대화 이력에서 이전에 잘못 안내한 내용이 있고, 새로운 정보(주문조회 결과 등)로 사실과 다름이 확인되면:
  - 에스컬레이션하지 말고, 직접 사과 후 정정 안내를 진행
  - 예: "앞서 안내드린 내용이 정확하지 않았습니다. 확인 결과 ~입니다. 혼란을 드려 죄송합니다."
  - confidence는 새로운 정보 기준으로 판단 (정정 자체는 에스컬레이션 사유가 아님)

인사말 규칙:
- 오늘 첫 답변일 때만: "안녕하세요, Suggest the better 널 담입니다."로 시작
- 추가 컨텍스트에 "오늘 이미 답변한 적 있음"이 포함되면 인삿말 없이 바로 본문으로 시작
- 대화 이력이 제공되면 이전 맥락을 이어서 자연스럽게 답변`;

/**
 * Gemini 기반 LLM 라우터 — 멀티키 폴백 + RAG(match_scripts) + Claude 폴백
 */
export async function generate(
  customerMessage: string,
  context?: string
): Promise<LLMResult> {
  if (API_KEYS.length === 0 && !ANTHROPIC_API_KEY) {
    throw new Error('GEMINI_API_KEY 또는 ANTHROPIC_API_KEY가 설정되지 않았습니다.');
  }

  // RAG: 참고 스크립트 + 과거 상담 사례 조회 (별도 Gemini 키 소진과 독립)
  let referenceText = '일치하는 안내 스크립트가 없습니다. 일반적인 CS 기준으로 친절하게 답변해주세요.';
  let conversationRef = '';
  let queryEmbedding: number[] | null = null;

  // embedding은 첫 번째 사용 가능한 키로 시도
  for (const key of API_KEYS) {
    try {
      const genAI = new GoogleGenerativeAI(key);
      const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
      const embeddingResult = await embeddingModel.embedContent(customerMessage);
      queryEmbedding = embeddingResult.embedding.values.slice(0, 768);
      break;
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('429') || msg.includes('quota') || msg.includes('exceeded')) continue;
      break; // 다른 에러는 중단
    }
  }

  if (queryEmbedding) {
    const [{ data: matchedScripts }, { data: matchedConvos }] = await Promise.all([
      supabase.rpc('match_scripts', {
        query_embedding: queryEmbedding,
        match_threshold: 0.3,
        match_count: 2,
      }),
      supabase.rpc('match_conversations', {
        query_embedding: queryEmbedding,
        match_threshold: 0.4,
        match_count: 2,
      }),
    ]);

    if (matchedScripts && matchedScripts.length > 0) {
      referenceText = matchedScripts
        .map((s: any, idx: number) => `[참고 스크립트 ${idx + 1}: ${s.title}]\n${s.content}`)
        .join('\n\n');
    }

    // Phase 4.3: RAG 중복 제거 — manager 응답만 참고 (bot 응답 제외)
    const filteredConvos = (matchedConvos || []).filter((c: any) => !c.source || c.source === 'manager');
    if (filteredConvos.length > 0) {
      conversationRef = filteredConvos
        .map((c: any, idx: number) =>
          `[과거 유사 상담 ${idx + 1}]\n고객: ${c.customer_text}\n상담사: ${c.manager_response}`
        )
        .join('\n\n');
    }
  }

  const prompt = [
    '[참고 스크립트]',
    referenceText,
    conversationRef ? `\n[과거 유사 상담 사례]\n${conversationRef}` : '',
    context ? `\n[추가 맥락]\n${context}` : '',
    `\n[고객 메시지]\n${customerMessage}`,
  ].join('\n');

  // Gemini 시도
  let lastError: any = null;
  for (let i = 0; i < API_KEYS.length; i++) {
    try {
      const result = await callGemini(API_KEYS[i], prompt);
      return result;
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

  // Phase 4.2: Claude 폴백
  if (ANTHROPIC_API_KEY) {
    console.log('🔄 Gemini 키 소진 → Claude 폴백');
    try {
      return await callClaude(prompt);
    } catch (err: any) {
      console.error('Claude 폴백 실패:', err.message);
      throw err;
    }
  }

  throw new Error(`모든 LLM API 키 한도 초과. 마지막 에러: ${lastError?.message}`);
}

async function callGemini(apiKey: string, prompt: string): Promise<LLMResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
  });

  // 30초 타임아웃
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const aiResult = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    clearTimeout(timer);
    const raw = aiResult.response.text();
    const parsed = parseJSON(raw);

    return {
      answer: parsed.answer || '',
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
      category: parsed.category || '기타',
      escalate: Boolean(parsed.escalate),
      reason: parsed.reason || '',
      model: 'gemini-2.5-flash',
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function callClaude(prompt: string): Promise<LLMResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Claude API error (${res.status}): ${body}`);
    }

    const data = await res.json();
    const raw = data.content?.[0]?.text || '';
    const parsed = parseJSON(raw);

    return {
      answer: parsed.answer || '',
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
      category: parsed.category || '기타',
      escalate: Boolean(parsed.escalate),
      reason: parsed.reason || '',
      model: 'claude-sonnet-4-20250514',
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

function parseJSON(raw: string): any {
  // ```json ... ``` 블록 추출
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenced ? fenced[1].trim() : raw.trim();
  return JSON.parse(jsonStr);
}
