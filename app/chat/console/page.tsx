'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

import {
  Box, Typography, Button, Stack, Chip, IconButton, TextField,
  CircularProgress, Badge, Divider, InputAdornment,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Send as SendIcon,
  Edit as EditIcon,
  Warning as WarningIcon,
  Person as PersonIcon,
  SmartToy as SmartToyIcon,
  HeadsetMic as HeadsetMicIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Search as SearchIcon,
} from '@mui/icons-material';

// ─── 타입 ───
interface Session {
  id: number;
  user_chat_id: string;
  channel_type: string;
  customer_name: string | null;
  status: string;
  opened_at: string;
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

const confidenceColor = (c: number) => {
  if (c >= 0.8) return '#10b981';
  if (c >= 0.5) return '#f59e0b';
  return '#ef4444';
};

// ─── 메인 ───
export default function ChatConsolePageWrapper() {
  return (
    <Suspense fallback={<Box sx={{ height: '100vh', bgcolor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress /></Box>}>
      <ChatConsolePage />
    </Suspense>
  );
}

function ChatConsolePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 세션 목록
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionSearch, setSessionSearch] = useState('');

  // 선택된 세션
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  // 메시지 & AI 응답
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiResponses, setAiResponses] = useState<AIResponse[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // AI 초안 편집/발송
  const [editingDraftId, setEditingDraftId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');

  // 읽지 않은 세션 트래킹
  const [unreadSessions, setUnreadSessions] = useState<Set<number>>(new Set());

  // ─── 세션 목록 로드 ───
  const fetchSessions = useCallback(async () => {
    const { data } = await supabase
      .from('chat_sessions')
      .select('*')
      .in('status', ['open', 'escalated'])
      .order('created_at', { ascending: false })
      .limit(100);
    setSessions(data || []);
    setSessionsLoading(false);
  }, []);

  // ─── 메시지 & AI 응답 로드 ───
  const fetchChat = useCallback(async (sessionId: number) => {
    setMessagesLoading(true);
    const [msgRes, aiRes] = await Promise.all([
      supabase.from('chat_messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
      supabase.from('ai_responses').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
    ]);
    setMessages(msgRes.data || []);
    setAiResponses(aiRes.data || []);
    setMessagesLoading(false);
  }, []);

  // 초기 로드
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // URL에서 세션 ID 가져오기
  useEffect(() => {
    const sessionParam = searchParams.get('session');
    if (sessionParam) {
      setActiveSessionId(Number(sessionParam));
    }
  }, [searchParams]);

  // 세션 선택 시 채팅 로드
  useEffect(() => {
    if (activeSessionId) {
      fetchChat(activeSessionId);
      const session = sessions.find(s => s.id === activeSessionId) || null;
      setActiveSession(session);
      setUnreadSessions(prev => {
        const next = new Set(prev);
        next.delete(activeSessionId);
        return next;
      });
    }
  }, [activeSessionId, sessions, fetchChat]);

  // 10초 폴링
  useEffect(() => {
    const iv = setInterval(() => {
      fetchSessions();
      if (activeSessionId) fetchChat(activeSessionId);
    }, 10000);
    return () => clearInterval(iv);
  }, [fetchSessions, fetchChat, activeSessionId]);

  // 스크롤 하단 유지
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── 발송 ───
  const handleSend = async (aiResponse: AIResponse, text?: string) => {
    if (!activeSession) return;
    setSending(true);
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userChatId: activeSession.user_chat_id,
          text: text || aiResponse.answer,
          aiResponseId: aiResponse.id,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditingDraftId(null);
      setEditText('');
      await fetchChat(activeSession.id);
    } catch (err) {
      alert(`발송 실패: ${err}`);
    } finally {
      setSending(false);
    }
  };

  // ─── 에스컬레이션 ───
  const handleEscalate = async () => {
    if (!activeSession || !escalateReason.trim()) return;
    setEscalating(true);
    try {
      const res = await fetch('/api/chat/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSession.id,
          userChatId: activeSession.user_chat_id,
          reason: escalateReason,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEscalateReason('');
      await Promise.all([fetchSessions(), fetchChat(activeSession.id)]);
    } catch (err) {
      alert(`에스컬레이션 실패: ${err}`);
    } finally {
      setEscalating(false);
    }
  };

  // 필터된 세션
  const filteredSessions = sessionSearch
    ? sessions.filter(s =>
        (s.customer_name || '').toLowerCase().includes(sessionSearch.toLowerCase()) ||
        s.user_chat_id.toLowerCase().includes(sessionSearch.toLowerCase())
      )
    : sessions;

  // 미발송 AI 초안
  const pendingDrafts = aiResponses.filter(a => !a.sent_at && a.mode === 'dryrun');

  const cardBorder = '1px solid rgba(255,255,255,0.08)';

  return (
    <Box sx={{ height: '100vh', bgcolor: '#0f172a', color: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      {/* 헤더 */}
      <Box sx={{ px: 2, py: 1, borderBottom: cardBorder, display: 'flex', alignItems: 'center', gap: 1 }}>
        <IconButton onClick={() => router.push('/chat')} sx={{ color: '#94a3b8' }}>
          <ArrowBackIcon />
        </IconButton>
        <HeadsetMicIcon sx={{ color: '#3b82f6' }} />
        <Typography variant="h6" fontWeight={700}>실시간 상담 콘솔</Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton onClick={() => { fetchSessions(); if (activeSessionId) fetchChat(activeSessionId); }} sx={{ color: '#94a3b8' }}>
          <RefreshIcon />
        </IconButton>
        <Typography variant="caption" sx={{ color: '#475569' }}>10초 자동 갱신</Typography>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ─── 좌측: 세션 목록 ─── */}
        <Box sx={{ width: 320, borderRight: cardBorder, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <Box sx={{ p: 1 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="세션 검색..."
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#64748b', fontSize: 18 }} /></InputAdornment>,
                },
              }}
              sx={{
                '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: 'rgba(255,255,255,0.04)' },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
              }}
            />
          </Box>

          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {sessionsLoading ? (
              <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={24} /></Box>
            ) : filteredSessions.length === 0 ? (
              <Typography variant="caption" sx={{ color: '#475569', p: 2, display: 'block', textAlign: 'center' }}>
                활성 세션 없음
              </Typography>
            ) : (
              filteredSessions.map((session) => (
                <Box
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  sx={{
                    px: 1.5, py: 1.2,
                    cursor: 'pointer',
                    bgcolor: activeSessionId === session.id ? 'rgba(59,130,246,0.1)' : 'transparent',
                    borderLeft: activeSessionId === session.id ? '3px solid #3b82f6' : '3px solid transparent',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Badge
                      variant="dot"
                      invisible={!unreadSessions.has(session.id)}
                      sx={{ '& .MuiBadge-badge': { bgcolor: '#ef4444' } }}
                    >
                      <Chip
                        label={channelLabel(session.channel_type)}
                        size="small"
                        sx={{
                          bgcolor: `${channelColor(session.channel_type)}22`,
                          color: channelColor(session.channel_type),
                          fontSize: '0.65rem',
                          height: 20,
                        }}
                      />
                    </Badge>
                    <Typography variant="body2" sx={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {session.customer_name || session.user_chat_id.slice(0, 16)}
                    </Typography>
                    <Chip
                      label={session.status}
                      size="small"
                      sx={{
                        fontSize: '0.6rem',
                        height: 18,
                        bgcolor: session.status === 'escalated' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.1)',
                        color: session.status === 'escalated' ? '#ef4444' : '#3b82f6',
                      }}
                    />
                  </Stack>
                  <Typography variant="caption" sx={{ color: '#475569', mt: 0.3, display: 'block' }}>
                    {format(new Date(session.created_at), 'MM/dd HH:mm')}
                  </Typography>
                </Box>
              ))
            )}
          </Box>
        </Box>

        {/* ─── 우측: 채팅 영역 ─── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!activeSessionId ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
              <Stack alignItems="center" spacing={1}>
                <HeadsetMicIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                <Typography>좌측에서 세션을 선택하세요</Typography>
              </Stack>
            </Box>
          ) : (
            <>
              {/* 세션 헤더 */}
              {activeSession && (
                <Box sx={{ px: 2, py: 1, borderBottom: cardBorder, bgcolor: 'rgba(255,255,255,0.02)' }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Chip
                      label={channelLabel(activeSession.channel_type)}
                      size="small"
                      sx={{
                        bgcolor: `${channelColor(activeSession.channel_type)}22`,
                        color: channelColor(activeSession.channel_type),
                        fontWeight: 600,
                      }}
                    />
                    <Typography variant="subtitle1" fontWeight={600}>
                      {activeSession.customer_name || activeSession.user_chat_id}
                    </Typography>
                    <Chip
                      label={activeSession.status}
                      size="small"
                      sx={{
                        bgcolor: activeSession.status === 'escalated' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.1)',
                        color: activeSession.status === 'escalated' ? '#ef4444' : '#3b82f6',
                      }}
                    />
                  </Stack>
                </Box>
              )}

              {/* 메시지 스레드 */}
              <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
                {messagesLoading ? (
                  <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={24} /></Box>
                ) : messages.length === 0 ? (
                  <Typography variant="caption" sx={{ color: '#475569', textAlign: 'center', display: 'block', py: 4 }}>
                    메시지가 없습니다
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    {messages.map((msg) => {
                      const isCustomer = msg.sender === 'customer';
                      return (
                        <Box key={msg.id} sx={{ display: 'flex', justifyContent: isCustomer ? 'flex-start' : 'flex-end' }}>
                          <Box sx={{
                            maxWidth: '65%',
                            px: 1.5, py: 1,
                            borderRadius: 2,
                            bgcolor: isCustomer ? 'rgba(255,255,255,0.06)' : 'rgba(59,130,246,0.12)',
                            border: isCustomer ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(59,130,246,0.25)',
                          }}>
                            <Stack direction="row" spacing={0.5} alignItems="center" mb={0.3}>
                              {isCustomer
                                ? <PersonIcon sx={{ fontSize: 13, color: '#94a3b8' }} />
                                : msg.sender === 'bot'
                                  ? <SmartToyIcon sx={{ fontSize: 13, color: '#3b82f6' }} />
                                  : <HeadsetMicIcon sx={{ fontSize: 13, color: '#8b5cf6' }} />
                              }
                              <Typography variant="caption" sx={{ color: '#64748b' }}>
                                {isCustomer ? '고객' : msg.sender === 'bot' ? 'AI 봇' : '상담사'}
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#475569' }}>
                                {format(new Date(msg.created_at), 'HH:mm')}
                              </Typography>
                            </Stack>
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>
                              {msg.text}
                            </Typography>
                          </Box>
                        </Box>
                      );
                    })}
                    <div ref={chatEndRef} />
                  </Stack>
                )}
              </Box>

              {/* ─── 하단: AI 초안 영역 ─── */}
              <Box sx={{ borderTop: cardBorder, bgcolor: 'rgba(15,23,42,0.8)', maxHeight: '40%', overflowY: 'auto' }}>
                {pendingDrafts.length > 0 ? (
                  pendingDrafts.map((draft) => (
                    <Box key={draft.id} sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {/* 메타 정보 */}
                      <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                        <SmartToyIcon sx={{ fontSize: 16, color: '#8b5cf6' }} />
                        <Typography variant="caption" sx={{ color: '#a78bfa', fontWeight: 600 }}>AI 초안</Typography>
                        <Chip label={draft.category} size="small" sx={{ bgcolor: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontSize: '0.65rem', height: 20 }} />
                        <Chip
                          label={`${(draft.confidence * 100).toFixed(0)}%`}
                          size="small"
                          sx={{
                            bgcolor: `${confidenceColor(draft.confidence)}22`,
                            color: confidenceColor(draft.confidence),
                            fontWeight: 700,
                            fontSize: '0.65rem',
                            height: 20,
                          }}
                        />
                        {draft.escalate && (
                          <Chip label="에스컬레이션 권장" size="small" sx={{ bgcolor: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: '0.65rem', height: 20 }} />
                        )}
                      </Stack>

                      {/* 초안 텍스트 or 편집 모드 */}
                      {editingDraftId === draft.id ? (
                        <TextField
                          fullWidth
                          multiline
                          minRows={2}
                          maxRows={6}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          sx={{
                            mb: 1,
                            '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: 'rgba(255,255,255,0.04)' },
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(139,92,246,0.3)' },
                          }}
                        />
                      ) : (
                        <Typography
                          variant="body2"
                          sx={{
                            whiteSpace: 'pre-wrap',
                            bgcolor: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 1.5,
                            p: 1.5,
                            mb: 1,
                            fontSize: '0.85rem',
                            color: '#cbd5e1',
                          }}
                        >
                          {draft.answer}
                        </Typography>
                      )}

                      {draft.reason && (
                        <Typography variant="caption" sx={{ color: '#64748b', mb: 1, display: 'block' }}>
                          사유: {draft.reason}
                        </Typography>
                      )}

                      {/* 액션 버튼 */}
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={sending ? <CircularProgress size={14} /> : <SendIcon />}
                          disabled={sending}
                          onClick={() => {
                            if (editingDraftId === draft.id) {
                              handleSend(draft, editText);
                            } else {
                              handleSend(draft);
                            }
                          }}
                          sx={{
                            bgcolor: '#3b82f6',
                            '&:hover': { bgcolor: '#2563eb' },
                            textTransform: 'none',
                          }}
                        >
                          {editingDraftId === draft.id ? '수정 후 발송' : '승인 발송'}
                        </Button>
                        {editingDraftId !== draft.id && (
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<EditIcon />}
                            onClick={() => { setEditingDraftId(draft.id); setEditText(draft.answer); }}
                            sx={{ color: '#f59e0b', borderColor: '#f59e0b', textTransform: 'none' }}
                          >
                            수정
                          </Button>
                        )}
                        {editingDraftId === draft.id && (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => { setEditingDraftId(null); setEditText(''); }}
                            sx={{ color: '#94a3b8', borderColor: 'rgba(255,255,255,0.15)', textTransform: 'none' }}
                          >
                            취소
                          </Button>
                        )}
                      </Stack>
                    </Box>
                  ))
                ) : (
                  <Box sx={{ p: 2 }}>
                    <Typography variant="caption" sx={{ color: '#475569' }}>
                      {aiResponses.length > 0 ? '모든 AI 초안이 발송되었습니다' : '대기 중인 AI 초안이 없습니다'}
                    </Typography>
                  </Box>
                )}

                {/* 에스컬레이션 패널 */}
                <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField
                      size="small"
                      placeholder="에스컬레이션 사유 입력..."
                      value={escalateReason}
                      onChange={(e) => setEscalateReason(e.target.value)}
                      sx={{
                        flex: 1,
                        '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: 'rgba(255,255,255,0.04)' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
                      }}
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={escalating ? <CircularProgress size={14} /> : <WarningIcon />}
                      disabled={escalating || !escalateReason.trim()}
                      onClick={handleEscalate}
                      sx={{ color: '#ef4444', borderColor: '#ef4444', textTransform: 'none', whiteSpace: 'nowrap' }}
                    >
                      에스컬레이션
                    </Button>
                  </Stack>
                </Box>
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
