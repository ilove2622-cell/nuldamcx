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

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics?days=${days}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
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

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
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
      </Container>
    </Box>
  );
}
