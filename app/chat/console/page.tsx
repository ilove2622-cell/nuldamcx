'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import {
  Box, Typography, Button, Stack, Chip, IconButton, TextField,
  CircularProgress, Badge, InputAdornment, Dialog,
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
  Search as SearchIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
  Replay as ReplayIcon,
  PhotoCamera as PhotoCameraIcon,
  Videocam as VideocamIcon,
  AttachFile as AttachFileIcon,
  OpenInNew as OpenInNewIcon,
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
  last_message_at: string | null;
  last_message_text: string | null;
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

const statusLabel = (status: string) => {
  if (status === 'open') return '신규';
  if (status === 'escalated') return '진행중';
  if (status === 'closed') return '완료';
  return status;
};

const statusColor = (status: string) => {
  if (status === 'open') return '#3b82f6';
  if (status === 'escalated') return '#ef4444';
  if (status === 'closed') return '#10b981';
  return '#64748b';
};

/** 시간 표시: 오늘=HH:mm, 어제=어제, 그 이전=MM/dd */
function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const toKSTDate = (t: Date) => new Date(t.getTime() + kstOffset).toISOString().slice(0, 10);
  const today = toKSTDate(now);
  const dateKST = toKSTDate(d);
  const yesterday = toKSTDate(new Date(now.getTime() - 86400000));

  if (dateKST === today) {
    const h = String(d.getUTCHours() + 9).padStart(2, '0');
    const hNum = Number(h) >= 24 ? Number(h) - 24 : Number(h);
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    return `${String(hNum).padStart(2, '0')}:${m}`;
  }
  if (dateKST === yesterday) return '어제';
  return `${dateKST.slice(5, 7)}/${dateKST.slice(8, 10)}`;
}

// 별표 로컬스토리지 관리
function getStarredSessions(): Set<number> {
  try {
    const raw = localStorage.getItem('starred_sessions');
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function toggleStarred(id: number): Set<number> {
  const starred = getStarredSessions();
  if (starred.has(id)) starred.delete(id);
  else starred.add(id);
  localStorage.setItem('starred_sessions', JSON.stringify([...starred]));
  return new Set(starred);
}

type TabKey = '전체' | '신규' | '진행중' | '완료' | '중요';

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
  const [activeTab, setActiveTab] = useState<TabKey>('전체');
  const [starred, setStarred] = useState<Set<number>>(new Set());

  // 선택된 세션
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  // 메시지 & AI 응답
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiResponses, setAiResponses] = useState<AIResponse[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // 자유 메시지 입력
  const [freeText, setFreeText] = useState('');
  const [selectedDraftIdx, setSelectedDraftIdx] = useState(0);
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');

  // 읽지 않은 세션 트래킹
  const [unreadSessions, setUnreadSessions] = useState<Set<number>>(new Set());

  // 이미지 모달
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);

  // 채널톡 데스크 패널
  const [showDeskPanel, setShowDeskPanel] = useState(false);

  // 로컬스토리지 초기화
  useEffect(() => {
    setStarred(getStarredSessions());
  }, []);

  // ─── 세션 목록 로드 ───
  const fetchSessions = useCallback(async () => {
    try {
      const data = await fetch('/api/chat/sessions?days=7').then(r => r.json());
      setSessions(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('세션 로드 실패:', e);
    }
    setSessionsLoading(false);
  }, []);

  // ─── 메시지 & AI 응답 로드 ───
  const fetchChat = useCallback(async (sessionId: number) => {
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/chat/messages?sessionId=${sessionId}`).then(r => r.json());
      setMessages(res.messages || []);
      setAiResponses(res.aiResponses || []);
    } catch (e) {
      console.error('채팅 로드 실패:', e);
    }
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
      setUnreadSessions(prev => {
        const next = new Set(prev);
        next.delete(activeSessionId);
        return next;
      });
    }
  }, [activeSessionId, fetchChat]);

  // activeSession은 sessions 변경 시에도 안정적으로 유지
  useEffect(() => {
    if (activeSessionId) {
      const found = sessions.find(s => s.id === activeSessionId) || null;
      setActiveSession(prev => {
        // 실제 내용이 바뀐 경우에만 업데이트 (깜빡임 방지)
        if (!found) return prev;
        if (!prev || prev.id !== found.id || prev.status !== found.status ||
            prev.last_message_at !== found.last_message_at) {
          return found;
        }
        return prev;
      });
    }
  }, [activeSessionId, sessions]);

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

  // ─── AI 초안 승인 발송 ───
  const handleSend = async (aiResponse: AIResponse) => {
    if (!activeSession) return;
    setSending(true);
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userChatId: activeSession.user_chat_id,
          text: aiResponse.answer,
          aiResponseId: aiResponse.id,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchChat(activeSession.id);
    } catch (err) {
      alert(`발송 실패: ${err}`);
    } finally {
      setSending(false);
    }
  };

  // ─── 자유 메시지 발송 ───
  const handleFreeSend = async () => {
    if (!activeSession || !freeText.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userChatId: activeSession.user_chat_id,
          text: freeText,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFreeText('');
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

  // ─── 별표 토글 ───
  const handleToggleStar = (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();
    setStarred(toggleStarred(sessionId));
  };

  // ─── 세션 상태 변경 ───
  const handleStatusChange = async (sessionId: number, newStatus: string) => {
    try {
      const res = await fetch('/api/chat/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, status: newStatus }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchSessions();
    } catch (err) {
      alert(`상태 변경 실패: ${err}`);
    }
  };

  // ─── 탭 + 검색 필터 ───
  const filteredSessions = sessions.filter(s => {
    // 탭 필터
    if (activeTab === '신규' && s.status !== 'open') return false;
    if (activeTab === '진행중' && s.status !== 'escalated') return false;
    if (activeTab === '완료' && s.status !== 'closed') return false;
    if (activeTab === '중요' && !starred.has(s.id)) return false;

    // 검색 필터
    if (sessionSearch) {
      const q = sessionSearch.toLowerCase();
      return (
        (s.customer_name || '').toLowerCase().includes(q) ||
        s.user_chat_id.toLowerCase().includes(q) ||
        (s.last_message_text || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // 미발송 AI 초안
  const pendingDrafts = aiResponses.filter(a => !a.sent_at && a.mode?.trim() === 'dryrun');

  const cardBorder = '1px solid rgba(255,255,255,0.08)';

  const tabs: { key: TabKey; label: string }[] = [
    { key: '전체', label: '전체' },
    { key: '신규', label: '신규' },
    { key: '진행중', label: '진행중' },
    { key: '완료', label: '완료' },
    { key: '중요', label: '\u2B50중요' },
  ];

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
        <Box sx={{ width: 340, borderRight: cardBorder, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          {/* 탭 */}
          <Box sx={{ px: 1, pt: 1, pb: 0.5 }}>
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
              {tabs.map(t => (
                <Chip
                  key={t.key}
                  label={t.label}
                  size="small"
                  onClick={() => setActiveTab(t.key)}
                  sx={{
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    height: 26,
                    fontWeight: activeTab === t.key ? 700 : 400,
                    bgcolor: activeTab === t.key ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                    color: activeTab === t.key ? '#60a5fa' : '#94a3b8',
                    border: activeTab === t.key ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  }}
                />
              ))}
            </Stack>
          </Box>

          {/* 검색 */}
          <Box sx={{ px: 1, pb: 1 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="이름, 채팅ID, 메시지 검색..."
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#64748b', fontSize: 18 }} /></InputAdornment>,
                },
              }}
              sx={{
                '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: 'rgba(255,255,255,0.04)', height: 34 },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
              }}
            />
          </Box>

          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {sessionsLoading ? (
              <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={24} /></Box>
            ) : filteredSessions.length === 0 ? (
              <Typography variant="caption" sx={{ color: '#475569', p: 2, display: 'block', textAlign: 'center' }}>
                {activeTab === '중요' ? '별표된 세션이 없습니다' : '세션 없음'}
              </Typography>
            ) : (
              filteredSessions.map((session) => (
                <Box
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  sx={{
                    px: 1.5, py: 1,
                    cursor: 'pointer',
                    bgcolor: activeSessionId === session.id ? 'rgba(59,130,246,0.1)' : 'transparent',
                    borderLeft: activeSessionId === session.id ? '3px solid #3b82f6' : '3px solid transparent',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <IconButton
                      size="small"
                      onClick={(e) => handleToggleStar(e, session.id)}
                      sx={{ p: 0.3, color: starred.has(session.id) ? '#f59e0b' : '#475569' }}
                    >
                      {starred.has(session.id) ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
                    </IconButton>
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
                          fontSize: '0.6rem',
                          height: 18,
                        }}
                      />
                    </Badge>
                    <Typography variant="body2" sx={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {session.customer_name || session.user_chat_id.slice(0, 16)}
                    </Typography>
                    <Chip
                      label={statusLabel(session.status)}
                      size="small"
                      sx={{
                        fontSize: '0.58rem',
                        height: 18,
                        bgcolor: `${statusColor(session.status)}22`,
                        color: statusColor(session.status),
                      }}
                    />
                    <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                      {formatTime(session.last_message_at || session.created_at)}
                    </Typography>
                  </Stack>
                  {/* 마지막 메시지 미리보기 */}
                  {session.last_message_text && (
                    <Typography
                      variant="caption"
                      sx={{
                        color: '#64748b',
                        mt: 0.3,
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.72rem',
                        pl: 3.5,
                      }}
                    >
                      {session.last_message_text}
                    </Typography>
                  )}
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
                      label={statusLabel(activeSession.status)}
                      size="small"
                      sx={{
                        bgcolor: `${statusColor(activeSession.status)}22`,
                        color: statusColor(activeSession.status),
                      }}
                    />
                    <Box sx={{ flex: 1 }} />
                    <Button
                      size="small"
                      variant={showDeskPanel ? 'contained' : 'outlined'}
                      startIcon={<OpenInNewIcon />}
                      onClick={() => setShowDeskPanel(prev => !prev)}
                      sx={{
                        textTransform: 'none', fontSize: '0.72rem',
                        color: showDeskPanel ? '#fff' : '#60a5fa',
                        bgcolor: showDeskPanel ? '#3b82f6' : 'transparent',
                        borderColor: '#3b82f6',
                        '&:hover': { bgcolor: showDeskPanel ? '#2563eb' : 'rgba(59,130,246,0.1)' },
                      }}
                    >
                      채널톡
                    </Button>
                    <IconButton
                      size="small"
                      onClick={(e) => handleToggleStar(e, activeSession.id)}
                      sx={{ color: starred.has(activeSession.id) ? '#f59e0b' : '#475569' }}
                    >
                      {starred.has(activeSession.id) ? <StarIcon sx={{ fontSize: 20 }} /> : <StarBorderIcon sx={{ fontSize: 20 }} />}
                    </IconButton>
                    {activeSession.status !== 'closed' ? (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<CheckCircleIcon />}
                        onClick={() => handleStatusChange(activeSession.id, 'closed')}
                        sx={{ color: '#10b981', borderColor: '#10b981', textTransform: 'none', fontSize: '0.75rem' }}
                      >
                        완료 처리
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ReplayIcon />}
                        onClick={() => handleStatusChange(activeSession.id, 'open')}
                        sx={{ color: '#3b82f6', borderColor: '#3b82f6', textTransform: 'none', fontSize: '0.75rem' }}
                      >
                        재오픈
                      </Button>
                    )}
                  </Stack>
                </Box>
              )}

              {/* 메시지 영역 (메시지 스레드 + 채널톡 데스크 패널) */}
              <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
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
                            bgcolor: isCustomer ? 'rgba(251,191,36,0.10)' : 'rgba(59,130,246,0.12)',
                            border: isCustomer ? '1px solid rgba(251,191,36,0.25)' : '1px solid rgba(59,130,246,0.25)',
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
                                {formatTime(msg.created_at)}
                              </Typography>
                            </Stack>
                            <Typography variant="body2" component="div" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', color: isCustomer ? '#fef3c7' : '#e2e8f0' }}>
                              {msg.text.split('\n').map((line: string, i: number) => {
                                // 공개 URL 이미지
                                const imgMatch = line.match(/^\[image:(https?:\/\/.+)\]$/);
                                if (imgMatch) {
                                  return (
                                    <Box
                                      key={i}
                                      component="img"
                                      src={imgMatch[1]}
                                      onClick={() => setImageModalUrl(imgMatch[1])}
                                      sx={{ maxWidth: '100%', maxHeight: 200, borderRadius: 1, mt: 0.5, cursor: 'pointer', '&:hover': { opacity: 0.85 } }}
                                    />
                                  );
                                }
                                // 채널톡 private 사진: [photo:chatId:fileId:dims:name]
                                const photoMatch = line.match(/^\[photo:([^:]*):([^:]*):([^:]*):([^\]]*)\]$/);
                                if (photoMatch) {
                                  const [, pChatId, pFileId, dims] = photoMatch;
                                  const proxyUrl = `/api/chat/file-proxy?chatId=${pChatId}&fileId=${pFileId}`;
                                  const deskUrl = `https://desk.channel.io/#/channels/35237/user_chats/${pChatId}`;
                                  return (
                                    <Box key={i} sx={{ mt: 0.5 }}>
                                      <Box
                                        component="img"
                                        src={proxyUrl}
                                        onClick={() => setImageModalUrl(proxyUrl)}
                                        onError={(e: any) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                                        sx={{ maxWidth: '100%', maxHeight: 200, borderRadius: 1, cursor: 'pointer', display: 'block', '&:hover': { opacity: 0.85 } }}
                                      />
                                      <Box onClick={() => window.open(deskUrl, '_blank')} sx={{
                                        display: 'none', p: 1.2, borderRadius: 1.5, cursor: 'pointer',
                                        bgcolor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
                                        alignItems: 'center', gap: 1, '&:hover': { bgcolor: 'rgba(59,130,246,0.15)' },
                                      }}>
                                        <PhotoCameraIcon sx={{ fontSize: 28, color: '#60a5fa' }} />
                                        <Box sx={{ flex: 1 }}>
                                          <Typography variant="caption" sx={{ color: '#93c5fd', fontWeight: 600 }}>
                                            사진 첨부{dims ? ` (${dims})` : ''} — 클릭하여 채널톡에서 보기
                                          </Typography>
                                        </Box>
                                        <OpenInNewIcon sx={{ fontSize: 16, color: '#64748b' }} />
                                      </Box>
                                    </Box>
                                  );
                                }
                                // 재생 가능한 동영상: [video-url:URL]
                                const videoUrlMatch = line.match(/^\[video-url:(https?:\/\/.+)\]$/);
                                if (videoUrlMatch) {
                                  return (
                                    <Box key={i} component="video" controls src={videoUrlMatch[1]}
                                      sx={{ maxWidth: '100%', maxHeight: 240, borderRadius: 1, mt: 0.5 }} />
                                  );
                                }
                                // 채널톡 private 동영상: [video:chatId:fileId:dur:name]
                                const videoMatch = line.match(/^\[video:([^:]*):([^:]*):([^:]*):([^\]]*)\]$/);
                                if (videoMatch) {
                                  const [, vChatId, vFileId, dur, name] = videoMatch;
                                  const proxyUrl = `/api/chat/file-proxy?chatId=${vChatId}&fileId=${vFileId}`;
                                  const deskUrl = `https://desk.channel.io/#/channels/35237/user_chats/${vChatId}`;
                                  return (
                                    <Box key={i} sx={{ mt: 0.5 }}>
                                      <Box component="video" controls src={proxyUrl}
                                        onError={(e: any) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                                        sx={{ maxWidth: '100%', maxHeight: 240, borderRadius: 1, display: 'block' }} />
                                      <Box onClick={() => window.open(deskUrl, '_blank')} sx={{
                                        display: 'none', p: 1.2, borderRadius: 1.5, cursor: 'pointer',
                                        bgcolor: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
                                        alignItems: 'center', gap: 1, '&:hover': { bgcolor: 'rgba(139,92,246,0.15)' },
                                      }}>
                                        <VideocamIcon sx={{ fontSize: 28, color: '#a78bfa' }} />
                                        <Box sx={{ flex: 1 }}>
                                          <Typography variant="caption" sx={{ color: '#c4b5fd', fontWeight: 600 }}>
                                            동영상{dur ? ` (${dur})` : ''}{name ? ` — ${name}` : ''} — 클릭하여 채널톡에서 보기
                                          </Typography>
                                        </Box>
                                        <OpenInNewIcon sx={{ fontSize: 16, color: '#64748b' }} />
                                      </Box>
                                    </Box>
                                  );
                                }
                                // 채널톡 private 파일: [file:chatId:fileId:size:name]
                                const fileMatch = line.match(/^\[file:([^:]*):([^:]*):([^:]*):([^\]]*)\]$/);
                                if (fileMatch) {
                                  const [, chatId, , size, name] = fileMatch;
                                  const deskUrl = `https://desk.channel.io/#/channels/35237/user_chats/${chatId}`;
                                  return (
                                    <Box key={i} onClick={() => window.open(deskUrl, '_blank')} sx={{
                                      mt: 0.5, p: 1.2, borderRadius: 1.5, cursor: 'pointer',
                                      bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                      display: 'flex', alignItems: 'center', gap: 1,
                                      '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                                    }}>
                                      <AttachFileIcon sx={{ fontSize: 24, color: '#94a3b8' }} />
                                      <Box sx={{ flex: 1 }}>
                                        <Typography variant="caption" sx={{ color: '#cbd5e1', fontWeight: 600, display: 'block' }}>
                                          {name || '첨부파일'}{size ? ` (${size})` : ''}
                                        </Typography>
                                      </Box>
                                      <OpenInNewIcon sx={{ fontSize: 16, color: '#64748b' }} />
                                    </Box>
                                  );
                                }
                                return <span key={i}>{line}{i < msg.text.split('\n').length - 1 ? '\n' : ''}</span>;
                              })}
                            </Typography>
                          </Box>
                        </Box>
                      );
                    })}
                    <div ref={chatEndRef} />
                  </Stack>
                )}
              </Box>

              {/* 채널톡 데스크 패널 (iframe) */}
              {showDeskPanel && activeSession && (
                <Box sx={{
                  width: '50%', minWidth: 360, borderLeft: cardBorder,
                  display: 'flex', flexDirection: 'column',
                }}>
                  <Box sx={{ px: 1.5, py: 0.5, borderBottom: cardBorder, bgcolor: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" sx={{ color: '#64748b', flex: 1 }}>
                      채널톡 데스크 — 사진·동영상 원본 확인
                    </Typography>
                    <IconButton size="small" onClick={() => window.open(`https://desk.channel.io/#/channels/35237/user_chats/${activeSession.user_chat_id}`, '_blank')} sx={{ color: '#64748b' }}>
                      <OpenInNewIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <IconButton size="small" onClick={() => setShowDeskPanel(false)} sx={{ color: '#64748b' }}>
                      <CloseIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                  <Box
                    key={`desk-${activeSession.user_chat_id}`}
                    component="iframe"
                    src={`https://desk.channel.io/#/channels/35237/user_chats/${activeSession.user_chat_id}`}
                    sx={{ flex: 1, border: 'none', bgcolor: '#fff' }}
                  />
                </Box>
              )}
              </Box>

              {/* ─── 하단: AI 초안 영역 ─── */}
              <Box sx={{ borderTop: cardBorder, bgcolor: 'rgba(15,23,42,0.8)', maxHeight: '40%', overflowY: 'auto' }}>
                {pendingDrafts.length > 0 ? (() => {
                  const idx = Math.min(selectedDraftIdx, pendingDrafts.length - 1);
                  const draft = pendingDrafts[idx];
                  return (
                    <Box sx={{ p: 2 }}>
                      {/* 초안 탭 선택 */}
                      {pendingDrafts.length > 1 && (
                        <Stack direction="row" spacing={0.5} mb={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                          {pendingDrafts.map((d, i) => (
                            <Chip
                              key={d.id}
                              label={`#${i + 1} ${d.category} ${(d.confidence * 100).toFixed(0)}%`}
                              size="small"
                              onClick={() => setSelectedDraftIdx(i)}
                              sx={{
                                cursor: 'pointer',
                                fontSize: '0.7rem',
                                height: 24,
                                bgcolor: i === idx ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.04)',
                                color: i === idx ? '#a78bfa' : '#64748b',
                                border: i === idx ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.08)',
                                fontWeight: i === idx ? 700 : 400,
                              }}
                            />
                          ))}
                        </Stack>
                      )}

                      {/* 메타 정보 */}
                      <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                        <SmartToyIcon sx={{ fontSize: 16, color: '#8b5cf6' }} />
                        <Typography variant="caption" sx={{ color: '#a78bfa', fontWeight: 600 }}>
                          AI 초안{pendingDrafts.length > 1 ? ` (${idx + 1}/${pendingDrafts.length})` : ''}
                        </Typography>
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

                      {/* 초안 텍스트 */}
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
                          maxHeight: 120,
                          overflowY: 'auto',
                        }}
                      >
                        {draft.answer}
                      </Typography>

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
                          onClick={() => handleSend(draft)}
                          sx={{
                            bgcolor: '#3b82f6',
                            '&:hover': { bgcolor: '#2563eb' },
                            textTransform: 'none',
                          }}
                        >
                          승인 발송
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<EditIcon />}
                          onClick={() => setFreeText(draft.answer)}
                          sx={{ color: '#f59e0b', borderColor: '#f59e0b', textTransform: 'none' }}
                        >
                          초안 복사
                        </Button>
                      </Stack>
                    </Box>
                  );
                })() : (
                  <Box sx={{ p: 2 }}>
                    <Typography variant="caption" sx={{ color: '#475569' }}>
                      {aiResponses.length > 0 ? '모든 AI 초안이 발송되었습니다' : '대기 중인 AI 초안이 없습니다'}
                    </Typography>
                  </Box>
                )}

                {/* 메시지 입력란 */}
                <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <Stack direction="row" spacing={1} alignItems="flex-end">
                    <TextField
                      size="small"
                      fullWidth
                      multiline
                      minRows={1}
                      maxRows={4}
                      placeholder="메시지를 입력하세요... (Ctrl+Enter로 발송)"
                      value={freeText}
                      onChange={(e) => setFreeText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.ctrlKey) {
                          e.preventDefault();
                          handleFreeSend();
                        }
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: 'rgba(255,255,255,0.04)' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(59,130,246,0.4)' },
                        '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#3b82f6' },
                      }}
                    />
                    <Button
                      variant="contained"
                      startIcon={sending ? <CircularProgress size={14} /> : <SendIcon />}
                      disabled={sending || !freeText.trim()}
                      onClick={handleFreeSend}
                      sx={{
                        bgcolor: '#3b82f6',
                        '&:hover': { bgcolor: '#2563eb' },
                        textTransform: 'none',
                        whiteSpace: 'nowrap',
                        minWidth: 80,
                      }}
                    >
                      발송
                    </Button>
                  </Stack>
                </Box>

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

      {/* 이미지 확대 모달 */}
      <Dialog
        open={!!imageModalUrl}
        onClose={() => setImageModalUrl(null)}
        maxWidth={false}
        slotProps={{
          paper: {
            sx: { bgcolor: 'rgba(0,0,0,0.95)', boxShadow: 'none', maxWidth: '90vw', maxHeight: '90vh' },
          },
        }}
      >
        <IconButton
          onClick={() => setImageModalUrl(null)}
          sx={{ position: 'absolute', top: 8, right: 8, color: '#fff', zIndex: 1 }}
        >
          <CloseIcon />
        </IconButton>
        {imageModalUrl && (
          <Box
            component="img"
            src={imageModalUrl}
            sx={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', display: 'block' }}
          />
        )}
      </Dialog>
    </Box>
  );
}
