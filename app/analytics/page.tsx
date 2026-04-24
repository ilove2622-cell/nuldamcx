'use client';

import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Card, CardContent, Stack,
  Select, MenuItem, CircularProgress, Chip,
} from '@mui/material';
import {
  SmartToy as SmartToyIcon,
  Warning as WarningIcon,
  Speed as SpeedIcon,
  Chat as ChatIcon,
  Send as SendIcon,
  TrendingUp as TrendingUpIcon,
  HeadsetMic as HeadsetMicIcon,
  Inbox as InboxIcon,
  HourglassEmpty as HourglassIcon,
  CheckCircle as CheckCircleIcon,
  Edit as EditIcon,
  SentimentSatisfied as PositiveIcon,
  SentimentNeutral as NeutralIcon,
  SentimentDissatisfied as NegativeIcon,
  AccessTime as AccessTimeIcon,
  Inventory as InventoryIcon,
  BugReport as BugReportIcon,
} from '@mui/icons-material';

interface DailyData {
  date: string;
  responses: number;
  escalations: number;
  avgConfidence: number;
  sent: number;
}

interface BoardDaily {
  date: string;
  total: number;
  completed: number;
}

interface AnalyticsData {
  summary: {
    totalResponses: number;
    totalEscalations: number;
    avgConfidence: number;
    escalationRate: number;
    sentCount: number;
    totalSessions: number;
  };
  daily: DailyData[];
  categories: Array<{ name: string; count: number }>;
  channels: Array<{ name: string; count: number }>;
  board?: {
    summary: { total: number; pending: number; saved: number; completed: number };
    channels: Array<{ name: string; count: number }>;
    daily: BoardDaily[];
  };
}

interface InsightsData {
  topIssues: Array<{ issue: string; count: number; category: string }>;
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
    samples: Array<{ text: string; sentiment: string; sessionId: number }>;
  };
  weeklyTrend: Array<{ week: string; sessions: number; escalations: number; avgResponseTime: number }>;
  monthlyTrend: Array<{ month: string; sessions: number; escalations: number; avgResponseTime: number }>;
  productIssues: Array<{ product: string; count: number; categories: Record<string, number> }>;
  hourlyDistribution: Array<{ hour: number; count: number }>;
}

const channelLabel = (type: string) => {
  if (type === 'appKakao') return '카카오톡';
  if (type === 'appNaverTalk') return '네이버톡톡';
  return '채널톡';
};

const CATEGORY_COLORS: Record<string, string> = {
  '주문조회': '#3b82f6',
  '배송': '#06b6d4',
  '환불': '#ef4444',
  '교환': '#f97316',
  '취소': '#f59e0b',
  '클레임': '#dc2626',
  '상품문의': '#8b5cf6',
  '기타': '#64748b',
};

function formatResponseTime(seconds: number): string {
  if (seconds < 60) return `${seconds}초`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}분`;
  return `${(seconds / 3600).toFixed(1)}시간`;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [days, setDays] = useState(7);
  const [trendTab, setTrendTab] = useState<'weekly' | 'monthly'>('weekly');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics?days=${days}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));

    setInsightsLoading(true);
    fetch(`/api/insights?days=${days}`)
      .then(r => r.json())
      .then(setInsights)
      .finally(() => setInsightsLoading(false));
  }, [days]);

  const cardSx = {
    bgcolor: 'rgba(15,23,42,0.6)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 2,
    backdropFilter: 'blur(10px)',
  };

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!data) return null;

  const { summary, daily, categories, channels, board } = data;
  const maxResponses = Math.max(...daily.map(d => d.responses), 1);
  const maxBoardDaily = board ? Math.max(...board.daily.map(d => d.total), 1) : 1;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', color: '#f8fafc', py: 3 }}>
      <Container maxWidth="xl">
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h5" fontWeight={700}>
            <HeadsetMicIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            채팅 상담 분석
          </Typography>
          <Select
            size="small"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            sx={{ color: '#f8fafc', minWidth: 100, '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }}
          >
            <MenuItem value={1}>오늘</MenuItem>
            <MenuItem value={3}>3일</MenuItem>
            <MenuItem value={7}>7일</MenuItem>
            <MenuItem value={30}>30일</MenuItem>
          </Select>
        </Stack>

        {/* KPI 카드 */}
        <Stack direction="row" spacing={2} mb={2} flexWrap="wrap" useFlexGap>
          {[
            { label: '총 세션', value: summary.totalSessions, icon: <ChatIcon />, color: '#3b82f6' },
            { label: 'AI 응답', value: summary.totalResponses, icon: <SmartToyIcon />, color: '#8b5cf6' },
            { label: '발송 완료', value: summary.sentCount, icon: <SendIcon />, color: '#10b981' },
            { label: '에스컬레이션', value: summary.totalEscalations, icon: <WarningIcon />, color: '#ef4444' },
            { label: '평균 신뢰도', value: `${(summary.avgConfidence * 100).toFixed(1)}%`, icon: <SpeedIcon />, color: summary.avgConfidence >= 0.8 ? '#10b981' : '#f59e0b' },
            { label: '에스컬레이션율', value: `${(summary.escalationRate * 100).toFixed(1)}%`, icon: <WarningIcon />, color: summary.escalationRate <= 0.3 ? '#10b981' : '#ef4444' },
          ].map(kpi => (
            <Card key={kpi.label} sx={{ ...cardSx, flex: '1 1 160px', minWidth: 160 }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" sx={{ color: '#94a3b8' }}>{kpi.label}</Typography>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="h5" fontWeight={700} sx={{ color: kpi.color }}>{kpi.value}</Typography>
                  <Box sx={{ color: kpi.color, opacity: 0.3 }}>{kpi.icon}</Box>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>

        {/* 채널별 세션 수 (인라인) */}
        <Stack direction="row" spacing={2} mb={3} alignItems="center">
          <Typography sx={{ color: '#64748b', fontSize: '0.9rem' }}>채널별</Typography>
          {channels.map(ch => (
            <Chip
              key={ch.name}
              label={`${channelLabel(ch.name)} ${ch.count}`}
              size="medium"
              sx={{
                bgcolor: `${ch.name === 'appKakao' ? '#fee500' : ch.name === 'appNaverTalk' ? '#03c75a' : '#3b82f6'}18`,
                color: ch.name === 'appKakao' ? '#fee500' : ch.name === 'appNaverTalk' ? '#03c75a' : '#3b82f6',
                fontWeight: 700,
                fontSize: '0.95rem',
              }}
            />
          ))}
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={3}>
          {/* 일별 추이 차트 (CSS 바 차트) */}
          <Card sx={{ ...cardSx, flex: 2 }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: '#94a3b8', mb: 2 }}>일별 응답 추이</Typography>
              <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, height: 160, overflow: 'hidden' }}>
                {daily.map(d => (
                  <Box key={d.date} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.3 }}>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.6rem' }}>{d.responses}</Typography>
                    <Box sx={{
                      width: '100%',
                      height: `${(d.responses / maxResponses) * 120}px`,
                      minHeight: 4,
                      bgcolor: '#3b82f6',
                      borderRadius: '3px 3px 0 0',
                      position: 'relative',
                    }}>
                      {d.escalations > 0 && (
                        <Box sx={{
                          position: 'absolute',
                          bottom: 0,
                          width: '100%',
                          height: `${(d.escalations / d.responses) * 100}%`,
                          bgcolor: '#ef4444',
                          borderRadius: '0 0 0 0',
                        }} />
                      )}
                    </Box>
                    <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.55rem', whiteSpace: 'nowrap' }}>
                      {d.date.slice(5)}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Stack direction="row" spacing={2} mt={1}>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Box sx={{ width: 10, height: 10, bgcolor: '#3b82f6', borderRadius: 0.5 }} />
                  <Typography variant="caption" sx={{ color: '#64748b' }}>AI 응답</Typography>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Box sx={{ width: 10, height: 10, bgcolor: '#ef4444', borderRadius: 0.5 }} />
                  <Typography variant="caption" sx={{ color: '#64748b' }}>에스컬레이션</Typography>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          {/* 카테고리 분포 */}
          <Card sx={{ ...cardSx, flex: 1 }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: '#94a3b8', mb: 2 }}>카테고리 분포</Typography>
              <Stack spacing={1}>
                {categories.map(cat => {
                  const maxCount = categories[0]?.count || 1;
                  return (
                    <Box key={cat.name}>
                      <Stack direction="row" justifyContent="space-between" mb={0.3}>
                        <Typography variant="caption" sx={{ color: '#cbd5e1' }}>{cat.name}</Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>{cat.count}</Typography>
                      </Stack>
                      <Box sx={{ height: 6, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                        <Box sx={{
                          height: '100%',
                          width: `${(cat.count / maxCount) * 100}%`,
                          bgcolor: CATEGORY_COLORS[cat.name] || '#64748b',
                          borderRadius: 3,
                        }} />
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>
        </Stack>


        {/* ─── 게시판 문의 분석 ─── */}
        {board && (
          <>
            <Typography variant="h5" fontWeight={700} sx={{ mb: 2, mt: 1 }}>
              <InboxIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              게시판 문의 분석
            </Typography>

            {/* 게시판 KPI */}
            <Stack direction="row" spacing={2} mb={3} flexWrap="wrap" useFlexGap>
              {[
                { label: '총 문의', value: board.summary.total, icon: <InboxIcon />, color: '#3b82f6' },
                { label: '대기/신규', value: board.summary.pending, icon: <HourglassIcon />, color: '#f59e0b' },
                { label: '답변저장', value: board.summary.saved, icon: <EditIcon />, color: '#8b5cf6' },
                { label: '처리완료', value: board.summary.completed, icon: <CheckCircleIcon />, color: '#10b981' },
              ].map(kpi => (
                <Card key={kpi.label} sx={{ ...cardSx, flex: '1 1 160px', minWidth: 160 }}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>{kpi.label}</Typography>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="h5" fontWeight={700} sx={{ color: kpi.color }}>{kpi.value}</Typography>
                      <Box sx={{ color: kpi.color, opacity: 0.3 }}>{kpi.icon}</Box>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={3}>
              {/* 게시판 일별 추이 */}
              <Card sx={{ ...cardSx, flex: 2 }}>
                <CardContent>
                  <Typography variant="subtitle2" sx={{ color: '#94a3b8', mb: 2 }}>일별 문의 추이</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, height: 160, overflow: 'hidden' }}>
                    {board.daily.map(d => (
                      <Box key={d.date} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.3 }}>
                        <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.6rem' }}>{d.total}</Typography>
                        <Box sx={{
                          width: '100%',
                          height: `${(d.total / maxBoardDaily) * 120}px`,
                          minHeight: 4,
                          bgcolor: '#f59e0b',
                          borderRadius: '3px 3px 0 0',
                          position: 'relative',
                        }}>
                          {d.completed > 0 && (
                            <Box sx={{
                              position: 'absolute',
                              bottom: 0,
                              width: '100%',
                              height: `${(d.completed / d.total) * 100}%`,
                              bgcolor: '#10b981',
                            }} />
                          )}
                        </Box>
                        <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.55rem', whiteSpace: 'nowrap' }}>
                          {d.date.slice(5)}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                  <Stack direction="row" spacing={2} mt={1}>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <Box sx={{ width: 10, height: 10, bgcolor: '#f59e0b', borderRadius: 0.5 }} />
                      <Typography variant="caption" sx={{ color: '#64748b' }}>접수</Typography>
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <Box sx={{ width: 10, height: 10, bgcolor: '#10b981', borderRadius: 0.5 }} />
                      <Typography variant="caption" sx={{ color: '#64748b' }}>처리완료</Typography>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>

              {/* 게시판 채널 분포 */}
              <Card sx={{ ...cardSx, flex: 1 }}>
                <CardContent>
                  <Typography variant="subtitle2" sx={{ color: '#94a3b8', mb: 2 }}>채널별 문의 수</Typography>
                  <Stack spacing={1}>
                    {board.channels.map(ch => {
                      const maxCount = board.channels[0]?.count || 1;
                      return (
                        <Box key={ch.name}>
                          <Stack direction="row" justifyContent="space-between" mb={0.3}>
                            <Typography variant="caption" sx={{ color: '#cbd5e1' }}>{ch.name}</Typography>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>{ch.count}</Typography>
                          </Stack>
                          <Box sx={{ height: 6, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                            <Box sx={{
                              height: '100%',
                              width: `${(ch.count / maxCount) * 100}%`,
                              bgcolor: '#f59e0b',
                              borderRadius: 3,
                            }} />
                          </Box>
                        </Box>
                      );
                    })}
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          </>
        )}


        {/* ─── CX 인사이트 ─── */}
        <Typography variant="h5" fontWeight={700} sx={{ mb: 2, mt: 4 }}>
          <TrendingUpIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          CX 인사이트
        </Typography>

        {insightsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={32} />
          </Box>
        ) : insights ? (
          <>
            {/* ─── A. 주요 이슈 TOP 10 ─── */}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={3}>
              <Card sx={{ ...cardSx, flex: 1 }}>
                <CardContent>
                  <Typography variant="subtitle2" sx={{ color: '#94a3b8', mb: 2 }}>
                    <BugReportIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
                    주요 이슈 TOP {Math.min(10, insights.topIssues.length)}
                  </Typography>
                  {insights.topIssues.length === 0 ? (
                    <Typography variant="body2" sx={{ color: '#475569' }}>에스컬레이션 데이터 없음</Typography>
                  ) : (
                    <Stack spacing={1}>
                      {insights.topIssues.map((issue, idx) => {
                        const maxIssueCount = insights.topIssues[0]?.count || 1;
                        return (
                          <Box key={idx}>
                            <Stack direction="row" alignItems="center" spacing={1} mb={0.3}>
                              <Typography variant="caption" sx={{ color: '#64748b', minWidth: 18 }}>
                                {idx + 1}.
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {issue.issue}
                              </Typography>
                              <Chip
                                label={issue.category}
                                size="small"
                                sx={{
                                  height: 18, fontSize: '0.6rem',
                                  bgcolor: `${CATEGORY_COLORS[issue.category] || '#64748b'}20`,
                                  color: CATEGORY_COLORS[issue.category] || '#64748b',
                                }}
                              />
                              <Typography variant="caption" sx={{ color: '#64748b' }}>{issue.count}</Typography>
                            </Stack>
                            <Box sx={{ height: 4, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden', ml: 3 }}>
                              <Box sx={{
                                height: '100%',
                                width: `${(issue.count / maxIssueCount) * 100}%`,
                                bgcolor: CATEGORY_COLORS[issue.category] || '#64748b',
                                borderRadius: 2,
                              }} />
                            </Box>
                          </Box>
                        );
                      })}
                    </Stack>
                  )}
                </CardContent>
              </Card>

              {/* ─── B. 고객 감정 분석 ─── */}
              <Card sx={{ ...cardSx, flex: 1 }}>
                <CardContent>
                  <Typography variant="subtitle2" sx={{ color: '#94a3b8', mb: 2 }}>고객 감정 분석</Typography>
                  {(() => {
                    const { positive, neutral, negative, samples } = insights.sentiment;
                    const total = positive + neutral + negative;
                    if (total === 0) return <Typography variant="body2" sx={{ color: '#475569' }}>분석 데이터 없음</Typography>;
                    const pPct = Math.round((positive / total) * 100);
                    const nePct = Math.round((neutral / total) * 100);
                    const ngPct = 100 - pPct - nePct;
                    return (
                      <>
                        {/* 감정 KPI */}
                        <Stack direction="row" spacing={1.5} mb={2}>
                          {[
                            { label: '긍정', value: positive, pct: pPct, color: '#10b981', icon: <PositiveIcon sx={{ fontSize: 16 }} /> },
                            { label: '중립', value: neutral, pct: nePct, color: '#f59e0b', icon: <NeutralIcon sx={{ fontSize: 16 }} /> },
                            { label: '부정', value: negative, pct: ngPct, color: '#ef4444', icon: <NegativeIcon sx={{ fontSize: 16 }} /> },
                          ].map(s => (
                            <Box key={s.label} sx={{ flex: 1, textAlign: 'center' }}>
                              <Box sx={{ color: s.color, mb: 0.3 }}>{s.icon}</Box>
                              <Typography variant="h6" fontWeight={700} sx={{ color: s.color }}>{s.value}</Typography>
                              <Typography variant="caption" sx={{ color: '#64748b' }}>{s.label} {s.pct}%</Typography>
                            </Box>
                          ))}
                        </Stack>

                        {/* 스택형 바 */}
                        <Box sx={{ height: 8, display: 'flex', borderRadius: 4, overflow: 'hidden', mb: 2 }}>
                          <Box sx={{ width: `${pPct}%`, bgcolor: '#10b981' }} />
                          <Box sx={{ width: `${nePct}%`, bgcolor: '#f59e0b' }} />
                          <Box sx={{ width: `${ngPct}%`, bgcolor: '#ef4444' }} />
                        </Box>

                        {/* 부정 감정 샘플 */}
                        {samples.length > 0 && (
                          <>
                            <Typography variant="caption" sx={{ color: '#94a3b8', mb: 1, display: 'block' }}>부정 감정 샘플</Typography>
                            <Stack spacing={0.5}>
                              {samples.map((s, i) => (
                                <Box key={i} sx={{ bgcolor: 'rgba(239,68,68,0.08)', borderRadius: 1, px: 1, py: 0.5 }}>
                                  <Typography variant="caption" sx={{ color: '#fca5a5', fontSize: '0.7rem' }}>
                                    #{s.sessionId} — {s.text.length > 80 ? s.text.slice(0, 80) + '...' : s.text}
                                  </Typography>
                                </Box>
                              ))}
                            </Stack>
                          </>
                        )}
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            </Stack>

            {/* ─── C. 시간대별 문의량 ─── */}
            <Card sx={{ ...cardSx, mb: 3 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: '#94a3b8', mb: 2 }}>
                  <AccessTimeIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
                  시간대별 문의량 (KST)
                </Typography>
                {(() => {
                  const maxHourly = Math.max(...insights.hourlyDistribution.map(h => h.count), 1);
                  const peakHour = insights.hourlyDistribution.reduce((a, b) => a.count > b.count ? a : b, { hour: 0, count: 0 });
                  return (
                    <>
                      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.3, height: 120 }}>
                        {insights.hourlyDistribution.map(h => (
                          <Box key={h.hour} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.2 }}>
                            {h.count > 0 && (
                              <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.5rem' }}>{h.count}</Typography>
                            )}
                            <Box sx={{
                              width: '100%',
                              height: `${(h.count / maxHourly) * 100}px`,
                              minHeight: h.count > 0 ? 4 : 2,
                              bgcolor: h.hour === peakHour.hour ? '#f59e0b' : '#3b82f6',
                              borderRadius: '2px 2px 0 0',
                              opacity: h.count === 0 ? 0.2 : 1,
                            }} />
                            <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.5rem' }}>
                              {h.hour}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                      {peakHour.count > 0 && (
                        <Typography variant="caption" sx={{ color: '#f59e0b', mt: 1, display: 'block' }}>
                          피크 시간: {peakHour.hour}시 ({peakHour.count}건)
                        </Typography>
                      )}
                    </>
                  );
                })()}
              </CardContent>
            </Card>

            {/* ─── D. 주간/월간 트렌드 ─── */}
            <Card sx={{ ...cardSx, mb: 3 }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="subtitle2" sx={{ color: '#94a3b8' }}>세션 & 에스컬레이션 트렌드</Typography>
                  <Stack direction="row" spacing={0.5}>
                    {(['weekly', 'monthly'] as const).map(tab => (
                      <Chip
                        key={tab}
                        label={tab === 'weekly' ? '주간' : '월간'}
                        size="small"
                        onClick={() => setTrendTab(tab)}
                        sx={{
                          bgcolor: trendTab === tab ? 'rgba(59,130,246,0.2)' : 'transparent',
                          color: trendTab === tab ? '#3b82f6' : '#64748b',
                          border: `1px solid ${trendTab === tab ? '#3b82f6' : 'rgba(255,255,255,0.08)'}`,
                          cursor: 'pointer',
                          '&:hover': { bgcolor: 'rgba(59,130,246,0.1)' },
                        }}
                      />
                    ))}
                  </Stack>
                </Stack>

                {(() => {
                  const trendData = trendTab === 'weekly' ? insights.weeklyTrend : insights.monthlyTrend;
                  const labelKey = trendTab === 'weekly' ? 'week' : 'month';
                  if (trendData.length === 0) return <Typography variant="body2" sx={{ color: '#475569' }}>데이터 없음</Typography>;
                  const maxSessions = Math.max(...trendData.map(d => d.sessions), 1);
                  return (
                    <>
                      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 160 }}>
                        {trendData.map((d: any) => (
                          <Box key={d[labelKey]} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.3 }}>
                            <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.6rem' }}>{d.sessions}</Typography>
                            <Box sx={{
                              width: '100%',
                              height: `${(d.sessions / maxSessions) * 120}px`,
                              minHeight: 4,
                              bgcolor: '#3b82f6',
                              borderRadius: '3px 3px 0 0',
                              position: 'relative',
                            }}>
                              {d.escalations > 0 && (
                                <Box sx={{
                                  position: 'absolute',
                                  bottom: 0,
                                  width: '100%',
                                  height: `${Math.min((d.escalations / d.sessions) * 100, 100)}%`,
                                  bgcolor: '#ef4444',
                                }} />
                              )}
                            </Box>
                            <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.5rem', whiteSpace: 'nowrap' }}>
                              {d[labelKey].slice(5)}
                            </Typography>
                            {d.avgResponseTime > 0 && (
                              <Typography variant="caption" sx={{ color: '#06b6d4', fontSize: '0.5rem' }}>
                                {formatResponseTime(d.avgResponseTime)}
                              </Typography>
                            )}
                          </Box>
                        ))}
                      </Box>
                      <Stack direction="row" spacing={2} mt={1}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Box sx={{ width: 10, height: 10, bgcolor: '#3b82f6', borderRadius: 0.5 }} />
                          <Typography variant="caption" sx={{ color: '#64748b' }}>세션</Typography>
                        </Stack>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Box sx={{ width: 10, height: 10, bgcolor: '#ef4444', borderRadius: 0.5 }} />
                          <Typography variant="caption" sx={{ color: '#64748b' }}>에스컬레이션</Typography>
                        </Stack>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Box sx={{ width: 8, height: 8, bgcolor: '#06b6d4', borderRadius: '50%' }} />
                          <Typography variant="caption" sx={{ color: '#64748b' }}>평균 응답시간</Typography>
                        </Stack>
                      </Stack>
                    </>
                  );
                })()}
              </CardContent>
            </Card>

            {/* ─── E. 상품별 문의 집중도 ─── */}
            {insights.productIssues.length > 0 && (
              <Card sx={{ ...cardSx, mb: 3 }}>
                <CardContent>
                  <Typography variant="subtitle2" sx={{ color: '#94a3b8', mb: 2 }}>
                    <InventoryIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
                    상품별 문의 집중도
                  </Typography>
                  <Stack spacing={1}>
                    {insights.productIssues.map((p, idx) => {
                      const maxProductCount = insights.productIssues[0]?.count || 1;
                      return (
                        <Box key={idx}>
                          <Stack direction="row" alignItems="center" spacing={1} mb={0.3}>
                            <Typography variant="caption" sx={{ color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.product}
                            </Typography>
                            <Stack direction="row" spacing={0.3}>
                              {Object.entries(p.categories).slice(0, 3).map(([cat, cnt]) => (
                                <Chip
                                  key={cat}
                                  label={`${cat} ${cnt}`}
                                  size="small"
                                  sx={{
                                    height: 16, fontSize: '0.55rem',
                                    bgcolor: `${CATEGORY_COLORS[cat] || '#64748b'}20`,
                                    color: CATEGORY_COLORS[cat] || '#64748b',
                                  }}
                                />
                              ))}
                            </Stack>
                            <Typography variant="caption" sx={{ color: '#64748b', minWidth: 24, textAlign: 'right' }}>{p.count}</Typography>
                          </Stack>
                          <Box sx={{ height: 4, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                            <Box sx={{
                              height: '100%',
                              width: `${(p.count / maxProductCount) * 100}%`,
                              bgcolor: '#8b5cf6',
                              borderRadius: 2,
                            }} />
                          </Box>
                        </Box>
                      );
                    })}
                  </Stack>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </Container>
    </Box>
  );
}
