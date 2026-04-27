import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** GET /api/analytics?days=7 — 자동응답 분석 데이터 */
export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get('days') || '7');
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [aiRes, escRes, sessRes, inqRes] = await Promise.all([
    supabase
      .from('ai_responses')
      .select('id, confidence, category, escalate, mode, sent_at, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true }),
    supabase
      .from('escalations')
      .select('id, category, created_at')
      .gte('created_at', since),
    supabase
      .from('chat_sessions')
      .select('id, status, channel_type, last_message_at')
      .not('last_message_at', 'is', null)
      .gte('last_message_at', since),
    supabase
      .from('inquiries')
      .select('id, status, channel, inquiry_date, collected_at')
      .gte('collected_at', since),
  ]);

  const aiResponses = aiRes.data || [];
  const escalations = escRes.data || [];
  const sessions = sessRes.data || [];
  const inquiries = inqRes.data || [];

  // 일별 집계
  const dailyMap = new Map<string, {
    date: string;
    responses: number;
    escalations: number;
    avgConfidence: number;
    confidenceSum: number;
    sent: number;
  }>();

  for (const ai of aiResponses) {
    const date = ai.created_at.slice(0, 10);
    const entry = dailyMap.get(date) || { date, responses: 0, escalations: 0, avgConfidence: 0, confidenceSum: 0, sent: 0 };
    entry.responses++;
    entry.confidenceSum += ai.confidence;
    if (ai.sent_at) entry.sent++;
    dailyMap.set(date, entry);
  }

  for (const esc of escalations) {
    const date = esc.created_at.slice(0, 10);
    const entry = dailyMap.get(date) || { date, responses: 0, escalations: 0, avgConfidence: 0, confidenceSum: 0, sent: 0 };
    entry.escalations++;
    dailyMap.set(date, entry);
  }

  const daily = [...dailyMap.values()]
    .map(d => ({ ...d, avgConfidence: d.responses > 0 ? d.confidenceSum / d.responses : 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 카테고리 분포
  const categoryMap = new Map<string, number>();
  for (const ai of aiResponses) {
    categoryMap.set(ai.category, (categoryMap.get(ai.category) || 0) + 1);
  }
  const categories = [...categoryMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  // 채널 분포
  const channelMap = new Map<string, number>();
  for (const s of sessions) {
    channelMap.set(s.channel_type, (channelMap.get(s.channel_type) || 0) + 1);
  }
  const channels = [...channelMap.entries()].map(([name, count]) => ({ name, count }));

  // 요약
  const totalResponses = aiResponses.length;
  const totalEscalations = escalations.length;
  const avgConfidence = totalResponses > 0
    ? aiResponses.reduce((s, r) => s + r.confidence, 0) / totalResponses
    : 0;
  const escalationRate = totalResponses > 0 ? totalEscalations / totalResponses : 0;
  const sentCount = aiResponses.filter(a => a.sent_at).length;

  // 게시판(inquiries) 통계
  const inqTotal = inquiries.length;
  const inqPending = inquiries.filter(i => i.status === '신규' || i.status === '대기').length;
  const inqSaved = inquiries.filter(i => i.status === '답변저장').length;
  const inqCompleted = inquiries.filter(i => i.status === '처리완료').length;

  // 게시판 채널 분포
  const inqChannelMap = new Map<string, number>();
  for (const i of inquiries) {
    const ch = i.channel || '기타';
    inqChannelMap.set(ch, (inqChannelMap.get(ch) || 0) + 1);
  }
  const inqChannels = [...inqChannelMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // 게시판 일별 추이
  const inqDailyMap = new Map<string, { date: string; total: number; completed: number }>();
  for (const i of inquiries) {
    const dateStr = (i.collected_at || i.inquiry_date || '').slice(0, 10);
    if (!dateStr) continue;
    const entry = inqDailyMap.get(dateStr) || { date: dateStr, total: 0, completed: 0 };
    entry.total++;
    if (i.status === '처리완료') entry.completed++;
    inqDailyMap.set(dateStr, entry);
  }
  const inqDaily = [...inqDailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    summary: { totalResponses, totalEscalations, avgConfidence, escalationRate, sentCount, totalSessions: sessions.length },
    daily,
    categories,
    channels,
    board: {
      summary: { total: inqTotal, pending: inqPending, saved: inqSaved, completed: inqCompleted },
      channels: inqChannels,
      daily: inqDaily,
    },
  });
}
