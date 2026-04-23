'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ToastProvider';
import { generateIdempotencyKey, getStarredSessions, toggleStarred } from '@/lib/chat-helpers';
import { channelLabel, channelColor, statusLabel, statusColor } from '@/lib/chat-helpers';
import RealtimeStatus from '@/components/RealtimeStatus';

import type { Session, Message, AIResponse, TabKey, SortKey } from '@/types/chat';

import SessionList from '@/components/chat/SessionList';
import ChatThread from '@/components/chat/ChatThread';
import DraftPanel from '@/components/chat/DraftPanel';
import MessageInput from '@/components/chat/MessageInput';
import EscalationPanel from '@/components/chat/EscalationPanel';
import CustomerSidebar from '@/components/chat/CustomerSidebar';

import {
  Box, Typography, Button, Stack, Chip, IconButton, Dialog,
  Menu, MenuItem, ListItemIcon, ListItemText, Divider,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  HeadsetMic as HeadsetMicIcon,
  Refresh as RefreshIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
  Replay as ReplayIcon,
  OpenInNew as OpenInNewIcon,
  Person as PersonIcon,
  ExpandMore as ExpandMoreIcon,
  Snooze as SnoozeIcon,
  PlayArrow as PlayArrowIcon,
} from '@mui/icons-material';

// ─── 메인 ───
export default function ChatConsolePageWrapper() {
  return (
    <Suspense fallback={<Box sx={{ height: '100vh', bgcolor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Typography sx={{ color: '#475569' }}>로딩 중...</Typography></Box>}>
      <ChatConsolePage />
    </Suspense>
  );
}

function ChatConsolePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  // 세션 목록
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionSearch, setSessionSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('console_activeTab') as TabKey;
      const valid: TabKey[] = ['전체', '응대중', '대기중', '종료', '중요'];
      if (saved && valid.includes(saved)) return saved;
    }
    return '전체';
  });
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

  // 필터 & 정렬
  const [filterUnread, setFilterUnread] = useState(false);
  const [filterStarred, setFilterStarred] = useState(false);
  const [filterChannel, setFilterChannel] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('console_sortKey') as SortKey) || 'last_message_at_desc';
    }
    return 'last_message_at_desc';
  });

  // 읽지 않은 세션 트래킹
  const [unreadSessions, setUnreadSessions] = useState<Set<number>>(new Set());

  // 이미지 모달
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);

  // 채널톡 데스크 패널
  const [showDeskPanel, setShowDeskPanel] = useState(false);

  // 고객 정보 사이드바 (항상 열림 기본값)
  const [showCustomerSidebar, setShowCustomerSidebar] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('console_customerSidebar') !== 'false';
    return true;
  });

  // Realtime 연결 상태
  const [realtimeState, setRealtimeState] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');

  // 로컬스토리지 초기화
  useEffect(() => {
    setStarred(getStarredSessions());
  }, []);

  // 탭 저장
  useEffect(() => {
    localStorage.setItem('console_activeTab', activeTab);
  }, [activeTab]);

  // 정렬 저장
  useEffect(() => {
    localStorage.setItem('console_sortKey', sortKey);
  }, [sortKey]);

  // 사이드바 저장
  useEffect(() => {
    localStorage.setItem('console_customerSidebar', String(showCustomerSidebar));
  }, [showCustomerSidebar]);

  // ─── 세션 목록 로드 ───
  const fetchSessions = useCallback(async () => {
    try {
      const data = await fetch('/api/chat/sessions?days=7').then(r => r.json());
      const newSessions: Session[] = Array.isArray(data) ? data : [];
      setSessions(prev => {
        if (prev.length === newSessions.length) {
          const same = prev.every((s, i) =>
            s.id === newSessions[i].id &&
            s.status === newSessions[i].status &&
            s.last_message_at === newSessions[i].last_message_at
          );
          if (same) return prev;
        }
        return newSessions;
      });
    } catch (e) {
      console.error('세션 로드 실패:', e);
    }
    setSessionsLoading(false);
  }, []);

  // ─── 메시지 & AI 응답 로드 ───
  const fetchChat = useCallback(async (sessionId: number, isPolling = false) => {
    if (!isPolling) setMessagesLoading(true);
    try {
      const res = await fetch(`/api/chat/messages?sessionId=${sessionId}`).then(r => r.json());
      const newMsgs: Message[] = res.messages || [];
      const newAi: AIResponse[] = res.aiResponses || [];
      setMessages(prev => {
        if (isPolling && prev.length === newMsgs.length && prev[prev.length - 1]?.id === newMsgs[newMsgs.length - 1]?.id) return prev;
        return newMsgs;
      });
      setAiResponses(prev => {
        if (isPolling && prev.length === newAi.length && prev[prev.length - 1]?.id === newAi[newAi.length - 1]?.id && prev[prev.length - 1]?.sent_at === newAi[newAi.length - 1]?.sent_at) return prev;
        return newAi;
      });
    } catch (e) {
      console.error('채팅 로드 실패:', e);
    }
    if (!isPolling) setMessagesLoading(false);
  }, []);

  // 초기 로드
  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // URL에서 세션 ID
  useEffect(() => {
    const sessionParam = searchParams.get('session');
    if (sessionParam) setActiveSessionId(Number(sessionParam));
  }, [searchParams]);

  // 세션 선택 시 URL 업데이트
  const handleSelectSession = useCallback((id: number) => {
    setActiveSessionId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('session', String(id));
    window.history.replaceState(null, '', url.toString());
  }, []);

  // 세션 선택 시 채팅 로드
  useEffect(() => {
    if (activeSessionId) {
      fetchChat(activeSessionId);
      setUnreadSessions(prev => { const next = new Set(prev); next.delete(activeSessionId); return next; });
    }
  }, [activeSessionId, fetchChat]);

  // activeSession 안정 유지
  useEffect(() => {
    if (activeSessionId) {
      const found = sessions.find(s => s.id === activeSessionId) || null;
      setActiveSession(prev => {
        if (!found) return prev;
        if (!prev || prev.id !== found.id || prev.status !== found.status || prev.last_message_at !== found.last_message_at) return found;
        return prev;
      });
    }
  }, [activeSessionId, sessions]);

  // Supabase Realtime + 폴링 fallback
  useEffect(() => {
    setRealtimeState('connecting');
    const channel = supabase
      .channel('console-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_sessions' }, () => fetchSessions())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, (payload) => {
        // 해당 세션만 업데이트
        if (activeSessionId && (payload.new as any)?.session_id === activeSessionId) {
          fetchChat(activeSessionId, true);
        }
        fetchSessions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_responses' }, (payload) => {
        if (activeSessionId && (payload.new as any)?.session_id === activeSessionId) {
          fetchChat(activeSessionId, true);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeState('connected');
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') setRealtimeState('disconnected');
      });

    // 폴링 간격: 연결 상태에 따라 다름
    const iv = setInterval(() => {
      fetchSessions();
      if (activeSessionId) fetchChat(activeSessionId, true);
    }, realtimeState === 'connected' ? 60000 : 10000);

    return () => { supabase.removeChannel(channel); clearInterval(iv); };
  }, [fetchSessions, fetchChat, activeSessionId, realtimeState]);

  // 스크롤
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMsgCountRef.current = messages.length;
  }, [messages]);

  // ─── 키보드 단축키 ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Escape: 모달/패널 닫기
      if (e.key === 'Escape') {
        if (imageModalUrl) { setImageModalUrl(null); return; }
        if (showDeskPanel) { setShowDeskPanel(false); return; }
      }
      // 화살표: 세션 이동
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.ctrlKey && !e.shiftKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        const filtered = sessions.filter(s => {
          if (activeTab === '응대중') return s.status === 'open' || s.status === 'escalated';
          if (activeTab === '대기중') return s.status === 'snoozed';
          if (activeTab === '종료') return s.status === 'closed';
          if (activeTab === '중요') return starred.has(s.id);
          return true;
        });
        if (filtered.length === 0) return;
        const curIdx = filtered.findIndex(s => s.id === activeSessionId);
        const nextIdx = e.key === 'ArrowDown'
          ? Math.min(curIdx + 1, filtered.length - 1)
          : Math.max(curIdx - 1, 0);
        handleSelectSession(filtered[nextIdx].id);
        e.preventDefault();
      }
      // Ctrl+Shift+E: 에스컬레이션 포커스
      if (e.key === 'E' && e.ctrlKey && e.shiftKey) {
        const el = document.querySelector<HTMLInputElement>('[placeholder*="에스컬레이션"]');
        if (el) { el.focus(); e.preventDefault(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sessions, activeSessionId, activeTab, starred, imageModalUrl, showDeskPanel, handleSelectSession]);

  // ─── AI 초안 승인 발송 (낙관적 업데이트) ───
  const handleSend = async (aiResponse: AIResponse) => {
    if (!activeSession) return;
    const idempotencyKey = generateIdempotencyKey();
    setSending(true);

    // 낙관적: 즉시 메시지 표시
    const optimisticMsg: Message = {
      id: Date.now(),
      session_id: activeSession.id,
      sender: 'bot',
      text: aiResponse.answer,
      created_at: new Date().toISOString(),
      _optimistic: true,
    };
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userChatId: activeSession.user_chat_id,
          text: aiResponse.answer,
          aiResponseId: aiResponse.id,
          idempotencyKey,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('발송 완료', 'success');
      await fetchChat(activeSession.id);
    } catch (err) {
      // 롤백
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
      showToast(`발송 실패: ${err}`, 'error');
    } finally {
      setSending(false);
    }
  };

  // ─── 자유 메시지 발송 (낙관적 업데이트) ───
  const handleFreeSend = async () => {
    if (!activeSession || !freeText.trim()) return;
    const idempotencyKey = generateIdempotencyKey();
    const textToSend = freeText;
    setSending(true);

    const optimisticMsg: Message = {
      id: Date.now(),
      session_id: activeSession.id,
      sender: 'bot',
      text: textToSend,
      created_at: new Date().toISOString(),
      _optimistic: true,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setFreeText('');

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userChatId: activeSession.user_chat_id,
          text: textToSend,
          idempotencyKey,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('발송 완료', 'success');
      await fetchChat(activeSession.id);
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
      setFreeText(textToSend);
      showToast(`발송 실패: ${err}`, 'error');
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
      showToast('에스컬레이션 완료', 'warning');
      await Promise.all([fetchSessions(), fetchChat(activeSession.id)]);
    } catch (err) {
      showToast(`에스컬레이션 실패: ${err}`, 'error');
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
  const handleStatusChange = async (sessionId: number, newStatus: string, snoozedUntil?: string) => {
    try {
      const res = await fetch('/api/chat/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, status: newStatus, snoozedUntil }),
      });
      if (!res.ok) throw new Error(await res.text());
      const labels: Record<string, string> = { open: '응대중', snoozed: '대기중', closed: '종료' };
      showToast(`상태 변경: ${labels[newStatus] || newStatus}`, 'success');
      await fetchSessions();
    } catch (err) {
      showToast(`상태 변경 실패: ${err}`, 'error');
    }
  };

  // 상태 드롭다운 메뉴
  const [statusMenuAnchor, setStatusMenuAnchor] = useState<HTMLElement | null>(null);
  const [snoozeSubmenuAnchor, setSnoozeSubmenuAnchor] = useState<HTMLElement | null>(null);

  const computeSnoozeTime = (option: string) => {
    const now = new Date();
    if (option === '4h') {
      return new Date(now.getTime() + 4 * 3600_000).toISOString();
    }
    // 내일 오전 9시
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (option === 'tomorrow_am') {
      tomorrow.setHours(9, 0, 0, 0);
      return tomorrow.toISOString();
    }
    // 내일 오후 2시
    tomorrow.setHours(14, 0, 0, 0);
    return tomorrow.toISOString();
  };

  // ─── 메시지로 스크롤 ───
  const handleScrollToMessage = useCallback((messageId: number) => {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 잠시 하이라이트
      (el as HTMLElement).style.transition = 'background-color 0.3s';
      (el as HTMLElement).style.backgroundColor = 'rgba(59,130,246,0.15)';
      setTimeout(() => { (el as HTMLElement).style.backgroundColor = ''; }, 1500);
    }
  }, []);

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
        <RealtimeStatus state={realtimeState} />
        <Box sx={{ flex: 1 }} />
        <IconButton onClick={() => { fetchSessions(); if (activeSessionId) fetchChat(activeSessionId); }} sx={{ color: '#94a3b8' }}>
          <RefreshIcon />
        </IconButton>
        <Typography variant="caption" sx={{ color: '#475569' }}>실시간 갱신</Typography>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 좌측: 세션 목록 */}
        <SessionList
          sessions={sessions}
          loading={sessionsLoading}
          activeSessionId={activeSessionId}
          activeTab={activeTab}
          sessionSearch={sessionSearch}
          starred={starred}
          unreadSessions={unreadSessions}
          filterUnread={filterUnread}
          filterStarred={filterStarred}
          filterChannel={filterChannel}
          filterAgent={filterAgent}
          filterTag={filterTag}
          sortKey={sortKey}
          onFilterUnreadChange={setFilterUnread}
          onFilterStarredChange={setFilterStarred}
          onFilterChannelChange={setFilterChannel}
          onFilterAgentChange={setFilterAgent}
          onFilterTagChange={setFilterTag}
          onSortKeyChange={setSortKey}
          onSelectSession={handleSelectSession}
          onTabChange={setActiveTab}
          onSearchChange={setSessionSearch}
          onToggleStar={handleToggleStar}
        />

        {/* 우측: 채팅 영역 */}
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
                      sx={{ bgcolor: `${channelColor(activeSession.channel_type)}22`, color: channelColor(activeSession.channel_type), fontWeight: 600 }}
                    />
                    <Typography variant="subtitle1" fontWeight={600}>
                      {activeSession.customer_name || activeSession.user_chat_id}
                    </Typography>
                    <Chip
                      label={statusLabel(activeSession.status)}
                      size="small"
                      sx={{ bgcolor: `${statusColor(activeSession.status)}22`, color: statusColor(activeSession.status) }}
                    />
                    <Box sx={{ flex: 1 }} />
                    <Button
                      size="small"
                      variant={showCustomerSidebar ? 'contained' : 'outlined'}
                      startIcon={<PersonIcon />}
                      onClick={() => setShowCustomerSidebar(prev => !prev)}
                      sx={{
                        textTransform: 'none', fontSize: '0.72rem',
                        color: showCustomerSidebar ? '#fff' : '#a78bfa',
                        bgcolor: showCustomerSidebar ? '#7c3aed' : 'transparent',
                        borderColor: '#7c3aed',
                        '&:hover': { bgcolor: showCustomerSidebar ? '#6d28d9' : 'rgba(124,58,237,0.1)' },
                      }}
                    >
                      고객정보
                    </Button>
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
                    <IconButton size="small" onClick={(e) => handleToggleStar(e, activeSession.id)} sx={{ color: starred.has(activeSession.id) ? '#f59e0b' : '#475569' }}>
                      {starred.has(activeSession.id) ? <StarIcon sx={{ fontSize: 20 }} /> : <StarBorderIcon sx={{ fontSize: 20 }} />}
                    </IconButton>
                    <Button
                      size="small"
                      variant="outlined"
                      endIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
                      onClick={(e) => setStatusMenuAnchor(e.currentTarget)}
                      sx={{
                        textTransform: 'none', fontSize: '0.72rem',
                        color: statusColor(activeSession.status),
                        borderColor: statusColor(activeSession.status),
                        '&:hover': { bgcolor: `${statusColor(activeSession.status)}15` },
                      }}
                    >
                      {statusLabel(activeSession.status)}
                    </Button>
                    <Menu
                      anchorEl={statusMenuAnchor}
                      open={!!statusMenuAnchor}
                      onClose={() => { setStatusMenuAnchor(null); setSnoozeSubmenuAnchor(null); }}
                      slotProps={{ paper: { sx: { bgcolor: '#1e293b', border: cardBorder, borderRadius: 1.5, minWidth: 160 } } }}
                    >
                      <MenuItem
                        onClick={() => { handleStatusChange(activeSession.id, 'open'); setStatusMenuAnchor(null); }}
                        selected={activeSession.status === 'open' || activeSession.status === 'escalated'}
                        sx={{ fontSize: '0.78rem', color: '#e2e8f0', '&.Mui-selected': { bgcolor: 'rgba(59,130,246,0.1)' } }}
                      >
                        <ListItemIcon><PlayArrowIcon sx={{ fontSize: 18, color: '#3b82f6' }} /></ListItemIcon>
                        <ListItemText slotProps={{ primary: { sx: { fontSize: '0.78rem' } } }}>응대중</ListItemText>
                      </MenuItem>
                      <MenuItem
                        onClick={(e) => setSnoozeSubmenuAnchor(e.currentTarget)}
                        selected={activeSession.status === 'snoozed'}
                        sx={{ fontSize: '0.78rem', color: '#e2e8f0', '&.Mui-selected': { bgcolor: 'rgba(139,92,246,0.1)' } }}
                      >
                        <ListItemIcon><SnoozeIcon sx={{ fontSize: 18, color: '#8b5cf6' }} /></ListItemIcon>
                        <ListItemText slotProps={{ primary: { sx: { fontSize: '0.78rem' } } }}>대기중</ListItemText>
                        <ExpandMoreIcon sx={{ fontSize: 14, color: '#64748b', transform: 'rotate(-90deg)', ml: 1 }} />
                      </MenuItem>
                      <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)' }} />
                      <MenuItem
                        onClick={() => { handleStatusChange(activeSession.id, 'closed'); setStatusMenuAnchor(null); }}
                        selected={activeSession.status === 'closed'}
                        sx={{ fontSize: '0.78rem', color: '#e2e8f0', '&.Mui-selected': { bgcolor: 'rgba(16,185,129,0.1)' } }}
                      >
                        <ListItemIcon><CheckCircleIcon sx={{ fontSize: 18, color: '#10b981' }} /></ListItemIcon>
                        <ListItemText slotProps={{ primary: { sx: { fontSize: '0.78rem' } } }}>종료</ListItemText>
                      </MenuItem>
                    </Menu>
                    {/* 스누즈 서브메뉴 */}
                    <Menu
                      anchorEl={snoozeSubmenuAnchor}
                      open={!!snoozeSubmenuAnchor}
                      onClose={() => setSnoozeSubmenuAnchor(null)}
                      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                      slotProps={{ paper: { sx: { bgcolor: '#1e293b', border: cardBorder, borderRadius: 1.5, minWidth: 140 } } }}
                    >
                      {[
                        { key: '4h', label: '4시간 이후' },
                        { key: 'tomorrow_am', label: '내일 오전' },
                        { key: 'tomorrow_pm', label: '내일 오후' },
                      ].map(opt => (
                        <MenuItem
                          key={opt.key}
                          onClick={() => {
                            handleStatusChange(activeSession.id, 'snoozed', computeSnoozeTime(opt.key));
                            setSnoozeSubmenuAnchor(null);
                            setStatusMenuAnchor(null);
                          }}
                          sx={{ fontSize: '0.78rem', color: '#e2e8f0' }}
                        >
                          {opt.label}
                        </MenuItem>
                      ))}
                    </Menu>
                  </Stack>
                </Box>
              )}

              {/* 메시지 영역 */}
              <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
                  <ChatThread
                    messages={messages}
                    loading={messagesLoading}
                    chatEndRef={chatEndRef}
                    onImageClick={setImageModalUrl}
                    onShowDesk={() => setShowDeskPanel(true)}
                  />
                </Box>

                {/* 채널톡 데스크 패널 */}
                {showDeskPanel && activeSession && (
                  <Box sx={{ width: '50%', minWidth: 360, borderLeft: cardBorder, display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ px: 1.5, py: 0.5, borderBottom: cardBorder, bgcolor: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="caption" sx={{ color: '#64748b', flex: 1 }}>채널톡 데스크 — 사진·동영상 원본 확인</Typography>
                      <IconButton size="small" onClick={() => window.open(`https://desk.channel.io/#/channels/35237/user_chats/${activeSession.user_chat_id}`, '_blank')} sx={{ color: '#64748b' }}>
                        <OpenInNewIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                      <IconButton size="small" onClick={() => setShowDeskPanel(false)} sx={{ color: '#64748b' }}>
                        <CloseIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                    <Box key={`desk-${activeSession.user_chat_id}`} component="iframe" src={`https://desk.channel.io/#/channels/35237/user_chats/${activeSession.user_chat_id}`} sx={{ flex: 1, border: 'none', bgcolor: '#fff' }} />
                  </Box>
                )}

                {/* 고객 정보 사이드바 */}
                {activeSession && (
                  <CustomerSidebar
                    session={activeSession}
                    messages={messages}
                    open={showCustomerSidebar}
                    onToggle={() => setShowCustomerSidebar(prev => !prev)}
                    onImageClick={setImageModalUrl}
                    onScrollToMessage={handleScrollToMessage}
                    onShowDesk={() => setShowDeskPanel(true)}
                  />
                )}
              </Box>

              {/* 하단: AI 초안 + 입력 + 에스컬레이션 */}
              <Box sx={{ borderTop: cardBorder, bgcolor: 'rgba(15,23,42,0.8)', maxHeight: '40%', overflowY: 'auto' }}>
                <DraftPanel
                  aiResponses={aiResponses}
                  selectedDraftIdx={selectedDraftIdx}
                  sending={sending}
                  onSelectDraft={setSelectedDraftIdx}
                  onSend={handleSend}
                  onCopyToEditor={setFreeText}
                />
                <MessageInput
                  freeText={freeText}
                  sending={sending}
                  onTextChange={setFreeText}
                  onSend={handleFreeSend}
                />
                <EscalationPanel
                  reason={escalateReason}
                  escalating={escalating}
                  onReasonChange={setEscalateReason}
                  onEscalate={handleEscalate}
                />
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
        slotProps={{ paper: { sx: { bgcolor: 'rgba(0,0,0,0.95)', boxShadow: 'none', maxWidth: '90vw', maxHeight: '90vh' } } }}
      >
        <IconButton onClick={() => setImageModalUrl(null)} sx={{ position: 'absolute', top: 8, right: 8, color: '#fff', zIndex: 1 }}>
          <CloseIcon />
        </IconButton>
        {imageModalUrl && (
          <Box component="img" src={imageModalUrl} sx={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', display: 'block' }} />
        )}
      </Dialog>
    </Box>
  );
}
