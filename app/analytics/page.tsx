'use client';

import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Card, CardContent, Stack,
  Select, MenuItem, CircularProgress,
} from '@mui/material';
import {
  SmartToy as SmartToyIcon,
  Warning as WarningIcon,
  Speed as SpeedIcon,
  Chat as ChatIcon,
  Send as SendIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';

interface DailyData {
  date: string;
  responses: number;
  escalations: number;
  avgConfidence: number;
  sent: number;
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

  const { summary, daily, categories, channels } = data;
  const maxResponses = Math.max(...daily.map(d => d.responses), 1);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', color: '#f8fafc', py: 3 }}>
      <Container maxWidth="xl">
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h5" fontWeight={700}>
            <TrendingUpIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            자동응답 분석
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
        <Stack direction="row" spacing={2} mb={3} flexWrap="wrap" useFlexGap>
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

        {/* 채널 분포 */}
        <Card sx={{ ...cardSx }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ color: '#94a3b8', mb: 2 }}>채널별 세션 수</Typography>
            <Stack direction="row" spacing={3}>
              {channels.map(ch => (
                <Stack key={ch.name} alignItems="center" spacing={0.5}>
                  <Typography variant="h4" fontWeight={700} sx={{ color: ch.name === 'appKakao' ? '#fee500' : ch.name === 'appNaverTalk' ? '#03c75a' : '#3b82f6' }}>
                    {ch.count}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#94a3b8' }}>{channelLabel(ch.name)}</Typography>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
