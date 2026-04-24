import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
].filter(Boolean) as string[];

/** GET /api/insights?days=7 */
export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get('days') || '7');
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [escRes, msgRes, sessRes, aiRes] = await Promise.all([
    supabase
      .from('escalations')
      .select('id, session_id, reason, category, created_at')
      .gte('created_at', since),
    supabase
      .from('chat_messages')
      .select('id, session_id, sender, text, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true }),
    supabase
      .from('chat_sessions')
      .select('id, status, channel_type, created_at')
      .gte('created_at', since),
    supabase
      .from('ai_responses')
      .select('id, session_id, prompt, category, created_at')
      .gte('created_at', since),
  ]);

  const escalations = escRes.data || [];
  const messages = msgRes.data || [];
  const sessions = sessRes.data || [];
  const aiResponses = aiRes.data || [];

  // ─── 1. 주요 이슈 TOP 10 ───
  const issueMap = new Map<string, { issue: string; count: number; category: string }>();
  for (const esc of escalations) {
    const reason = (esc.reason || '').trim();
    if (!reason) continue;
    // 간단한 키워드 정규화: 앞 20자로 그룹핑
    const key = reason.length > 20 ? reason.slice(0, 20) : reason;
    const existing = issueMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      issueMap.set(key, { issue: reason, count: 1, category: esc.category || '기타' });
    }
  }
  const topIssues = [...issueMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // ─── 2. 고객 감정 분석 ───
  // 세션별 마지막 고객 메시지 추출 (최대 100건)
  const lastCustomerMsgBySession = new Map<number, { text: string; sessionId: number }>();
  for (const msg of messages) {
    if (msg.sender === 'customer' && msg.text) {
      lastCustomerMsgBySession.set(msg.session_id, {
        text: msg.text.slice(0, 200), // 비용 절감
        sessionId: msg.session_id,
      });
    }
  }
  const samplesToAnalyze = [...lastCustomerMsgBySession.values()].slice(0, 100);

  let sentiment = { positive: 0, neutral: 0, negative: 0, samples: [] as Array<{ text: string; sentiment: string; sessionId: number }> };

  if (samplesToAnalyze.length > 0 && API_KEYS.length > 0) {
    try {
      sentiment = await analyzeSentiment(samplesToAnalyze);
    } catch (err) {
      console.error('감정 분석 실패:', err);
      // 실패 시 빈 결과 반환 (전체 API 실패하지 않도록)
    }
  }

  // ─── 3. 주간/월간 트렌드 ───
  const weeklyTrend = buildWeeklyTrend(sessions, escalations, messages);
  const monthlyTrend = buildMonthlyTrend(sessions, escalations, messages);

  // ─── 4. 상품별 문의 집중도 ───
  const productIssues = extractProductIssues(aiResponses);

  // ─── 5. 시간대별 문의량 ───
  const hourlyDistribution = buildHourlyDistribution(messages);

  return NextResponse.json({
    topIssues,
    sentiment,
    weeklyTrend,
    monthlyTrend,
    productIssues,
    hourlyDistribution,
  });
}

// ─── 감정 분석 (Gemini Flash) ───
async function analyzeSentiment(
  samples: Array<{ text: string; sessionId: number }>
): Promise<{
  positive: number;
  neutral: number;
  negative: number;
  samples: Array<{ text: string; sentiment: string; sessionId: number }>;
}> {
  const numbered = samples.map((s, i) => `${i + 1}. ${s.text}`).join('\n');
  const prompt = `아래 고객 메시지들의 감정을 분석해줘. 각 메시지에 대해 positive, neutral, negative 중 하나로 분류해.
JSON 배열로만 응답해. 형식: [{"idx":1,"s":"positive"},{"idx":2,"s":"negative"},...]
추가 설명 없이 JSON만 출력해.

${numbered}`;

  let result: Array<{ idx: number; s: string }> = [];
  for (const key of API_KEYS) {
    try {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const aiResult = await model.generateContent(prompt);
      const raw = aiResult.response.text();
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = fenced ? fenced[1].trim() : raw.trim();
      result = JSON.parse(jsonStr);
      break;
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('429') || msg.includes('quota')) continue;
      throw err;
    }
  }

  let positive = 0, neutral = 0, negative = 0;
  const negativeSamples: Array<{ text: string; sentiment: string; sessionId: number }> = [];

  for (const r of result) {
    const idx = r.idx - 1;
    if (idx < 0 || idx >= samples.length) continue;
    const s = r.s?.toLowerCase() || 'neutral';
    if (s === 'positive') positive++;
    else if (s === 'negative') {
      negative++;
      if (negativeSamples.length < 5) {
        negativeSamples.push({ text: samples[idx].text, sentiment: 'negative', sessionId: samples[idx].sessionId });
      }
    } else neutral++;
  }

  return { positive, neutral, negative, samples: negativeSamples };
}

// ─── 주간 트렌드 ───
function buildWeeklyTrend(
  sessions: any[],
  escalations: any[],
  messages: any[]
) {
  const weekMap = new Map<string, { sessions: number; escalations: number; responseTimes: number[] }>();

  for (const s of sessions) {
    const w = getWeekLabel(s.created_at);
    const entry = weekMap.get(w) || { sessions: 0, escalations: 0, responseTimes: [] };
    entry.sessions++;
    weekMap.set(w, entry);
  }
  for (const e of escalations) {
    const w = getWeekLabel(e.created_at);
    const entry = weekMap.get(w) || { sessions: 0, escalations: 0, responseTimes: [] };
    entry.escalations++;
    weekMap.set(w, entry);
  }

  // 응답시간 계산: 세션별 첫 고객메시지 → 첫 봇/상담사 응답
  const sessionFirstCustomer = new Map<number, string>();
  const sessionFirstResponse = new Map<number, string>();
  for (const msg of messages) {
    if (msg.sender === 'customer' && !sessionFirstCustomer.has(msg.session_id)) {
      sessionFirstCustomer.set(msg.session_id, msg.created_at);
    }
    if ((msg.sender === 'bot' || msg.sender === 'manager') && !sessionFirstResponse.has(msg.session_id)) {
      sessionFirstResponse.set(msg.session_id, msg.created_at);
    }
  }
  for (const [sid, custTime] of sessionFirstCustomer) {
    const respTime = sessionFirstResponse.get(sid);
    if (respTime) {
      const diff = (new Date(respTime).getTime() - new Date(custTime).getTime()) / 1000; // seconds
      if (diff > 0 && diff < 86400) { // 24시간 이내만
        const w = getWeekLabel(custTime);
        const entry = weekMap.get(w);
        if (entry) entry.responseTimes.push(diff);
      }
    }
  }

  return [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, d]) => ({
      week,
      sessions: d.sessions,
      escalations: d.escalations,
      avgResponseTime: d.responseTimes.length > 0
        ? Math.round(d.responseTimes.reduce((a, b) => a + b, 0) / d.responseTimes.length)
        : 0,
    }));
}

// ─── 월간 트렌드 ───
function buildMonthlyTrend(
  sessions: any[],
  escalations: any[],
  messages: any[]
) {
  const monthMap = new Map<string, { sessions: number; escalations: number; responseTimes: number[] }>();

  for (const s of sessions) {
    const m = s.created_at.slice(0, 7); // YYYY-MM
    const entry = monthMap.get(m) || { sessions: 0, escalations: 0, responseTimes: [] };
    entry.sessions++;
    monthMap.set(m, entry);
  }
  for (const e of escalations) {
    const m = e.created_at.slice(0, 7);
    const entry = monthMap.get(m) || { sessions: 0, escalations: 0, responseTimes: [] };
    entry.escalations++;
    monthMap.set(m, entry);
  }

  // 응답시간 (세션별 첫 고객메시지 → 첫 봇/상담사 응답)
  const sessionFirstCustomer = new Map<number, string>();
  const sessionFirstResponse = new Map<number, string>();
  for (const msg of messages) {
    if (msg.sender === 'customer' && !sessionFirstCustomer.has(msg.session_id)) {
      sessionFirstCustomer.set(msg.session_id, msg.created_at);
    }
    if ((msg.sender === 'bot' || msg.sender === 'manager') && !sessionFirstResponse.has(msg.session_id)) {
      sessionFirstResponse.set(msg.session_id, msg.created_at);
    }
  }
  for (const [sid, custTime] of sessionFirstCustomer) {
    const respTime = sessionFirstResponse.get(sid);
    if (respTime) {
      const diff = (new Date(respTime).getTime() - new Date(custTime).getTime()) / 1000;
      if (diff > 0 && diff < 86400) {
        const m = custTime.slice(0, 7);
        const entry = monthMap.get(m);
        if (entry) entry.responseTimes.push(diff);
      }
    }
  }

  return [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({
      month,
      sessions: d.sessions,
      escalations: d.escalations,
      avgResponseTime: d.responseTimes.length > 0
        ? Math.round(d.responseTimes.reduce((a, b) => a + b, 0) / d.responseTimes.length)
        : 0,
    }));
}

// ─── 상품별 문의 집중도 ───
function extractProductIssues(aiResponses: any[]) {
  const productMap = new Map<string, { count: number; categories: Record<string, number> }>();

  for (const ai of aiResponses) {
    const prompt = ai.prompt || '';
    // 정규식: [사방넷 주문조회 결과] 블록 내 상품: 라인
    const productMatches = prompt.match(/상품\s*[:：]\s*(.+)/g);
    if (!productMatches) continue;

    for (const match of productMatches) {
      const name = match.replace(/상품\s*[:：]\s*/, '').trim();
      if (!name || name.length < 2) continue;
      // 상품명 정규화: 앞 30자
      const key = name.length > 30 ? name.slice(0, 30) : name;
      const existing = productMap.get(key) || { count: 0, categories: {} };
      existing.count++;
      const cat = ai.category || '기타';
      existing.categories[cat] = (existing.categories[cat] || 0) + 1;
      productMap.set(key, existing);
    }
  }

  return [...productMap.entries()]
    .map(([product, data]) => ({ product, count: data.count, categories: data.categories }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

// ─── 시간대별 문의량 ───
function buildHourlyDistribution(messages: any[]) {
  const hours = new Array(24).fill(0);
  for (const msg of messages) {
    if (msg.sender !== 'customer') continue;
    // KST = UTC+9
    const d = new Date(msg.created_at);
    const kstHour = (d.getUTCHours() + 9) % 24;
    hours[kstHour]++;
  }
  return hours.map((count, hour) => ({ hour, count }));
}

// ─── 유틸 ───
function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  // ISO week: 해당 주의 월요일 날짜
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}
