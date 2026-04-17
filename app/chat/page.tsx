'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';

import {
  Box, Container, Typography, Button, Card, CardContent, Stack,
  CircularProgress, MenuItem, Select, TextField, Chip, Collapse,
  IconButton, InputAdornment, LinearProgress,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Chat as ChatIcon,
  SmartToy as SmartToyIcon,
  Warning as WarningIcon,
  Speed as SpeedIcon,
  Search as SearchIcon,
  HeadsetMic as HeadsetMicIcon,
  Person as PersonIcon,
  ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';

// ─── 타입 ───
interface Session {
  id: number;
  user_chat_id: string;
  channel_type: string;
  customer_name: string | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
}

interface Message {
  id: number;
  session_id: number;
  sender: string;
  text: string;
  created_at: string;
}

interface AIResponse {
  id: number;
  session_id: number;
  message_id: number | null;
  answer: string;
  confidence: number;
  category: string;
  escalate: boolean;
  reason: string;
  mode: string;
  sent_at: string | null;
  created_at: string;
}

// ─── 헬퍼 ───
const channelLabel = (type: string) => {
  if (type === 'appKakao') return '카카오톡';
  if (type === 'appNaverTalk') return '네이버톡톡';
  return '채널톡';
};

const channelColor = (type: string) => {
  if (type === 'appKakao') return '#fee500';
  if (type === 'appNaverTalk') return '#03c75a';
  return '#3b82f6';
};

const statusColor = (status: string) => {
  if (status === 'open') return { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' };
  if (status === 'closed') return { color: '#10b981', bg: 'rgba(16,185,129,0.1)' };
  if (status === 'escalated') return { color: '#ef4444', bg: 'rgba(239,68,68,0.1)' };
  return { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' };
};

const confidenceColor = (c: number) => {
  if (c >= 0.8) return '#10b981';
  if (c >= 0.5) return '#f59e0b';
  return '#ef4444';
};

const CATEGORIES = ['전체', '주문조회', '배송', '환불', '교환', '취소', '클레임', '상품문의', '기타'];
const STATUSES = ['전체', 'open', 'closed', 'escalated'];
const CHANNELS = ['전체', 'appKakao', 'appNaverTalk', 'native'];

// ─── 메인 ───
export default function ChatDashboardPage() {
  const router = useRouter();

  // 데이터
  const [sessions, setSessions] = useState<Session[]>([]);
  const [aiResponses, setAiResponses] = useState<AIResponse[]>([]);
  const [escalations, setEscalations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<Message[]>([]);
  const [expandedAI, setExpandedAI] = useState<AIResponse[]>([]);

  // 필터
  const [days, setDays] = useState(1);
  const [filterChannel, setFilterChannel] = useState('전체');
  const [filterStatus, setFilterStatus] = useState('전체');
  const [filterCategory, setFilterCategory] = useState('전체');
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const since = subDays(new Date(), days).toISOString();

    const [sessRes, aiRes, escRes] = await Promise.all([
      supabase.from('chat_sessions').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(500),
      supabase.from('ai_responses').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(1000),
      supabase.from('escalations').select('*').gte('created_at', since).limit(500),
    ]);

    setSessions(sessRes.data || []);
    setAiResponses(aiRes.data || []);
    setEscalations(escRes.data || []);
    setLoading(false);
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 30초 자동 갱신
  useEffect(() => {
    const iv = setInterval(fetchData, 30000);
    return () => clearInterval(iv);
  }, [fetchData]);

  // KPI 계산
  const kpi = useMemo(() => {
    const totalSessions = sessions.length;
    const totalAI = aiResponses.length;
    const totalEsc = escalations.length;
    const avgConf = totalAI > 0
      ? aiResponses.reduce((s, r) => s + r.confidence, 0) / totalAI
      : 0;
    return { totalSessions, totalAI, totalEsc, avgConf };
  }, [sessions, aiResponses, escalations]);

  // 필터링
  const filtered = useMemo(() => {
    let list = sessions;
    if (filterChannel !== '전체') list = list.filter(s => s.channel_type === filterChannel);
    if (filterStatus !== '전체') list = list.filter(s => s.status === filterStatus);
    if (filterCategory !== '전체') {
      const sessionIds = new Set(aiResponses.filter(a => a.category === filterCategory).map(a => a.session_id));
      list = list.filter(s => sessionIds.has(s.id));
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        (s.customer_name || '').toLowerCase().includes(q) ||
        s.user_chat_id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [sessions, aiResponses, filterChannel, filterStatus, filterCategory, search]);

  // 세션 확장 시 상세 로드
  const toggleExpand = async (sessionId: number) => {
    if (expandedId === sessionId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(sessionId);
    const [msgRes, aiRes] = await Promise.all([
      supabase.from('chat_messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
      supabase.from('ai_responses').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
    ]);
    setExpandedMessages(msgRes.data || []);
    setExpandedAI(aiRes.data || []);
  };

  const cardSx = {
    bgcolor: 'rgba(15,23,42,0.6)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 2,
    backdropFilter: 'blur(10px)',
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', color: '#f8fafc', py: 3 }}>
      <Container maxWidth="xl">
        {/* 헤더 */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h5" fontWeight={700}>
            <ChatIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            채팅 상담 모니터링
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<HeadsetMicIcon />}
              onClick={() => router.push('/chat/console')}
              sx={{ color: '#3b82f6', borderColor: '#3b82f6' }}
            >
              상담 콘솔
            </Button>
            <IconButton onClick={fetchData} sx={{ color: '#94a3b8' }}>
              <RefreshIcon />
            </IconButton>
          </Stack>
        </Stack>

        {/* KPI 카드 */}
        <Stack direction="row" spacing={2} mb={3} flexWrap="wrap" useFlexGap>
          {[
            { label: '총 세션', value: kpi.totalSessions, icon: <ChatIcon />, color: '#3b82f6' },
            { label: 'AI 응답', value: kpi.totalAI, icon: <SmartToyIcon />, color: '#8b5cf6' },
            { label: '에스컬레이션', value: kpi.totalEsc, icon: <WarningIcon />, color: '#ef4444' },
            { label: '평균 신뢰도', value: `${(kpi.avgConf * 100).toFixed(1)}%`, icon: <SpeedIcon />, color: confidenceColor(kpi.avgConf) },
          ].map((kpiItem) => (
            <Card key={kpiItem.label} sx={{ ...cardSx, flex: '1 1 200px', minWidth: 200 }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>{kpiItem.label}</Typography>
                    <Typography variant="h4" fontWeight={700} sx={{ color: kpiItem.color }}>
                      {kpiItem.value}
                    </Typography>
                  </Box>
                  <Box sx={{ color: kpiItem.color, opacity: 0.3, fontSize: 40 }}>{kpiItem.icon}</Box>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>

        {/* 필터 */}
        <Card sx={{ ...cardSx, mb: 3 }}>
          <CardContent>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
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

              <Select
                size="small"
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value)}
                sx={{ color: '#f8fafc', minWidth: 120, '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }}
              >
                {CHANNELS.map(ch => (
                  <MenuItem key={ch} value={ch}>{ch === '전체' ? '전체 채널' : channelLabel(ch)}</MenuItem>
                ))}
              </Select>

              <Select
                size="small"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                sx={{ color: '#f8fafc', minWidth: 120, '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }}
              >
                {STATUSES.map(st => (
                  <MenuItem key={st} value={st}>{st === '전체' ? '전체 상태' : st}</MenuItem>
                ))}
              </Select>

              <Select
                size="small"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                sx={{ color: '#f8fafc', minWidth: 120, '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }}
              >
                {CATEGORIES.map(cat => (
                  <MenuItem key={cat} value={cat}>{cat === '전체' ? '전체 카테고리' : cat}</MenuItem>
                ))}
              </Select>

              <TextField
                size="small"
                placeholder="고객명/채팅ID 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#94a3b8' }} /></InputAdornment>,
                  },
                }}
                sx={{
                  minWidth: 200,
                  '& .MuiOutlinedInput-root': { color: '#f8fafc' },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
                }}
              />

              <Typography variant="caption" sx={{ color: '#64748b' }}>
                {filtered.length}건 / 30초 자동 갱신
              </Typography>
            </Stack>
          </CardContent>
        </Card>

        {loading && <LinearProgress sx={{ mb: 2 }} />}

        {/* 세션 리스트 */}
        <Stack spacing={1}>
          {filtered.map((session) => {
            const sc = statusColor(session.status);
            const isExpanded = expandedId === session.id;
            const sessionAIs = aiResponses.filter(a => a.session_id === session.id);
            const latestAI = sessionAIs[0];

            return (
              <Card key={session.id} sx={{ ...cardSx, cursor: 'pointer' }} onClick={() => toggleExpand(session.id)}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  {/* 요약 행 */}
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Chip
                      label={channelLabel(session.channel_type)}
                      size="small"
                      sx={{
                        bgcolor: `${channelColor(session.channel_type)}22`,
                        color: channelColor(session.channel_type),
                        fontWeight: 600,
                        fontSize: '0.7rem',
                      }}
                    />
                    <Chip
                      label={session.status}
                      size="small"
                      sx={{ bgcolor: sc.bg, color: sc.color, fontWeight: 600, fontSize: '0.7rem' }}
                    />
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      <PersonIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                      {session.customer_name || session.user_chat_id.slice(0, 12)}
                    </Typography>
                    {latestAI && (
                      <>
                        <Chip label={latestAI.category} size="small" variant="outlined" sx={{ color: '#94a3b8', borderColor: 'rgba(255,255,255,0.15)', fontSize: '0.7rem' }} />
                        <Typography variant="caption" sx={{ color: confidenceColor(latestAI.confidence), fontWeight: 600 }}>
                          {(latestAI.confidence * 100).toFixed(0)}%
                        </Typography>
                      </>
                    )}
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                      {format(new Date(session.created_at), 'MM/dd HH:mm')}
                    </Typography>
                    <IconButton size="small" sx={{ color: '#94a3b8' }}>
                      {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  </Stack>

                  {/* 확장 상세 */}
                  <Collapse in={isExpanded} onClick={(e) => e.stopPropagation()}>
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {/* 메시지 타임라인 */}
                      <Typography variant="caption" sx={{ color: '#64748b', mb: 1, display: 'block' }}>
                        메시지 타임라인
                      </Typography>
                      <Stack spacing={1} sx={{ mb: 2, maxHeight: 300, overflowY: 'auto' }}>
                        {expandedMessages.map((msg) => (
                          <Box
                            key={msg.id}
                            sx={{
                              display: 'flex',
                              justifyContent: msg.sender === 'customer' ? 'flex-start' : 'flex-end',
                            }}
                          >
                            <Box
                              sx={{
                                maxWidth: '70%',
                                px: 1.5, py: 0.8,
                                borderRadius: 2,
                                bgcolor: msg.sender === 'customer'
                                  ? 'rgba(255,255,255,0.06)'
                                  : 'rgba(59,130,246,0.15)',
                                border: msg.sender === 'customer'
                                  ? '1px solid rgba(255,255,255,0.08)'
                                  : '1px solid rgba(59,130,246,0.3)',
                              }}
                            >
                              <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 0.3 }}>
                                {msg.sender === 'customer' ? '고객' : msg.sender === 'bot' ? 'AI 봇' : '상담사'}
                                {' '}
                                {format(new Date(msg.created_at), 'HH:mm:ss')}
                              </Typography>
                              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>
                                {msg.text}
                              </Typography>
                            </Box>
                          </Box>
                        ))}
                        {expandedMessages.length === 0 && (
                          <Typography variant="caption" sx={{ color: '#475569' }}>메시지 없음</Typography>
                        )}
                      </Stack>

                      {/* AI 응답 상세 */}
                      {expandedAI.length > 0 && (
                        <>
                          <Typography variant="caption" sx={{ color: '#64748b', mb: 1, display: 'block' }}>
                            AI 응답 내역
                          </Typography>
                          <Stack spacing={1}>
                            {expandedAI.map((ai) => (
                              <Box
                                key={ai.id}
                                sx={{
                                  p: 1.5,
                                  borderRadius: 1.5,
                                  bgcolor: 'rgba(139,92,246,0.06)',
                                  border: '1px solid rgba(139,92,246,0.15)',
                                }}
                              >
                                <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                                  <Chip
                                    label={ai.category}
                                    size="small"
                                    sx={{ bgcolor: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontSize: '0.7rem' }}
                                  />
                                  <Chip
                                    label={`${(ai.confidence * 100).toFixed(0)}%`}
                                    size="small"
                                    sx={{
                                      bgcolor: `${confidenceColor(ai.confidence)}22`,
                                      color: confidenceColor(ai.confidence),
                                      fontWeight: 700,
                                      fontSize: '0.7rem',
                                    }}
                                  />
                                  <Chip
                                    label={ai.mode}
                                    size="small"
                                    variant="outlined"
                                    sx={{ color: ai.mode === 'live' ? '#10b981' : '#f59e0b', borderColor: ai.mode === 'live' ? '#10b981' : '#f59e0b', fontSize: '0.65rem' }}
                                  />
                                  {ai.sent_at && (
                                    <Chip label="발송됨" size="small" sx={{ bgcolor: 'rgba(16,185,129,0.15)', color: '#10b981', fontSize: '0.65rem' }} />
                                  )}
                                  {ai.escalate && (
                                    <Chip label="에스컬레이션" size="small" sx={{ bgcolor: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: '0.65rem' }} />
                                  )}
                                  <Typography variant="caption" sx={{ color: '#64748b', ml: 'auto' }}>
                                    {format(new Date(ai.created_at), 'HH:mm:ss')}
                                  </Typography>
                                </Stack>
                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.83rem', color: '#cbd5e1' }}>
                                  {ai.answer}
                                </Typography>
                                {ai.reason && (
                                  <Typography variant="caption" sx={{ color: '#64748b', mt: 0.5, display: 'block' }}>
                                    사유: {ai.reason}
                                  </Typography>
                                )}
                              </Box>
                            ))}
                          </Stack>
                        </>
                      )}

                      {/* 콘솔 이동 */}
                      <Box sx={{ mt: 2, textAlign: 'right' }}>
                        <Button
                          size="small"
                          endIcon={<ArrowForwardIcon />}
                          onClick={() => router.push(`/chat/console?session=${session.id}`)}
                          sx={{ color: '#3b82f6' }}
                        >
                          상담 콘솔에서 보기
                        </Button>
                      </Box>
                    </Box>
                  </Collapse>
                </CardContent>
              </Card>
            );
          })}

          {!loading && filtered.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 8, color: '#475569' }}>
              <ChatIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
              <Typography>조건에 맞는 세션이 없습니다</Typography>
            </Box>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
