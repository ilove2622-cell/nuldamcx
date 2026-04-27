'use client';

import React, { useMemo, useRef, useLayoutEffect } from 'react';
import {
  Box, Typography, Stack, Chip, IconButton, TextField, InputAdornment, Badge,
  Select, MenuItem, FormControl, CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  FiberManualRecord as DotIcon,
  Close as CloseIcon,
  CalendarMonth as CalendarIcon,
} from '@mui/icons-material';
import type { Session, TabKey, SortKey, SessionTag, CustomerTag } from '@/types/chat';
import { channelLabel, channelColor, statusLabel, statusColor, formatTime } from '@/lib/chat-helpers';
import { highlightText } from '@/lib/highlight';
import SessionSkeleton from './SessionSkeleton';

interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;
}

interface SessionListProps {
  sessions: Session[];
  loading: boolean;
  activeSessionId: number | null;
  activeTab: TabKey;
  sessionSearch: string;
  starred: Set<number>;
  unreadSessions: Set<number>;
  filterUnread: boolean;
  filterUnanswered: boolean;
  filterChannel: string;
  filterAgent: string;
  filterTag: string;
  sortKey: SortKey;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  onFilterUnreadChange: (v: boolean) => void;
  onFilterUnansweredChange: (v: boolean) => void;
  onFilterChannelChange: (v: string) => void;
  onFilterAgentChange: (v: string) => void;
  onFilterTagChange: (v: string) => void;
  onSortKeyChange: (v: SortKey) => void;
  onSelectSession: (id: number) => void;
  onTabChange: (tab: TabKey) => void;
  onSearchChange: (q: string) => void;
  onToggleStar: (e: React.MouseEvent, id: number) => void;
  sentinelRef?: React.RefObject<HTMLDivElement | null>;
  loadingMore?: boolean;
  hasMore?: boolean;
}

// 탭은 동적으로 건수 포함하여 렌더링
const TAB_KEYS: TabKey[] = ['전체', '응대중', '대기중', '종료', '중요'];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'last_message_at_desc', label: '최신 메시지순' },
  { key: 'last_message_at_asc', label: '오래된 메시지순' },
  { key: 'created_at_desc', label: '생성일 최신순' },
];

const selectSx = {
  color: '#94a3b8', fontSize: '0.7rem', height: 28,
  '& .MuiSelect-select': { py: 0.3, px: 1 },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
  '& .MuiSvgIcon-root': { color: '#64748b', fontSize: 16 },
};

const menuItemSx = { fontSize: '0.72rem' };

export default function SessionList({
  sessions, loading, activeSessionId, activeTab, sessionSearch,
  starred, unreadSessions,
  filterUnread, filterUnanswered, filterChannel, filterAgent, filterTag, sortKey,
  dateRange, onDateRangeChange,
  onFilterUnreadChange, onFilterUnansweredChange, onFilterChannelChange, onFilterAgentChange, onFilterTagChange, onSortKeyChange,
  onSelectSession, onTabChange, onSearchChange, onToggleStar, sentinelRef,
  loadingMore, hasMore,
}: SessionListProps) {

  // 드롭다운 옵션을 sessions에서 동적 추출
  const channelOptions = useMemo(() =>
    [...new Set(sessions.map(s => s.channel_type))].sort(),
    [sessions]
  );

  const agentOptions = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach(s => {
      if (s.assigned_agent) map.set(s.assigned_agent, s.assigned_agent_name || s.assigned_agent);
    });
    return [...map.entries()]; // [id, name][]
  }, [sessions]);

  const tagOptions = useMemo(() => {
    const map = new Map<string, { label: string; color: string }>();
    sessions.forEach(s => {
      (s.session_tags_data || []).forEach(t => map.set(t.label, { label: t.label, color: t.color }));
      (s.customer_tags_data || []).forEach(t => map.set(t.label, { label: t.label, color: t.color }));
    });
    return [...map.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [sessions]);

  // 활성 필터 개수
  const activeFilterCount = [filterUnread, filterUnanswered, !!filterChannel, !!filterAgent, !!filterTag].filter(Boolean).length;

  const resetFilters = () => {
    onFilterUnreadChange(false);
    onFilterUnansweredChange(false);
    onFilterChannelChange('');
    onFilterAgentChange('');
    onFilterTagChange('');
  };

  // 필터 + 정렬
  const filteredSessions = useMemo(() => {
    let result = sessions.filter(s => {
      // 탭 필터
      if (activeTab === '응대중' && s.status !== 'open' && s.status !== 'escalated') return false;
      if (activeTab === '대기중' && s.status !== 'snoozed') return false;
      if (activeTab === '종료' && s.status !== 'closed') return false;
      if (activeTab === '중요' && !starred.has(s.id)) return false;
      // 토글 필터
      if (filterUnread && !unreadSessions.has(s.id)) return false;
      if (filterUnanswered && (s.last_message_sender !== 'customer' || s.status === 'closed')) return false;
      // 드롭다운 필터
      if (filterChannel && s.channel_type !== filterChannel) return false;
      if (filterAgent && s.assigned_agent !== filterAgent) return false;
      if (filterTag) {
        const allTagLabels = [
          ...(s.session_tags_data || []).map(t => t.label),
          ...(s.customer_tags_data || []).map(t => t.label),
        ];
        if (!allTagLabels.includes(filterTag)) return false;
      }
      // 검색
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

    // 정렬
    result.sort((a, b) => {
      if (sortKey === 'last_message_at_desc') {
        return (b.last_message_at || b.created_at).localeCompare(a.last_message_at || a.created_at);
      }
      if (sortKey === 'last_message_at_asc') {
        return (a.last_message_at || a.created_at).localeCompare(b.last_message_at || b.created_at);
      }
      // created_at_desc
      return b.created_at.localeCompare(a.created_at);
    });

    return result;
  }, [sessions, activeTab, starred, unreadSessions, filterUnread, filterUnanswered, filterChannel, filterAgent, filterTag, sessionSearch, sortKey]);

  // 탭별 건수
  const tabCounts = useMemo(() => {
    const active = sessions.filter(s => s.status === 'open' || s.status === 'escalated').length;
    const snoozed = sessions.filter(s => s.status === 'snoozed').length;
    const closed = sessions.filter(s => s.status === 'closed').length;
    const important = sessions.filter(s => starred.has(s.id)).length;
    return { '전체': sessions.length, '응대중': active, '대기중': snoozed, '종료': closed, '중요': important } as Record<TabKey, number>;
  }, [sessions, starred]);

  // 스크롤 위치 보존: 세션 목록이 재정렬되어도 현재 스크롤 위치 유지
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollRef = useRef(0);

  // 렌더링 직전에 스크롤 위치 저장
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // 활성 세션이 있으면 해당 세션 DOM으로 스크롤 보정
    if (activeSessionId) {
      const activeEl = el.querySelector(`[data-session-id="${activeSessionId}"]`);
      if (activeEl) {
        const containerRect = el.getBoundingClientRect();
        const activeRect = (activeEl as HTMLElement).getBoundingClientRect();
        // 현재 보이는 영역 밖이면 스크롤하여 보이게
        if (activeRect.top < containerRect.top || activeRect.bottom > containerRect.bottom) {
          (activeEl as HTMLElement).scrollIntoView({ block: 'nearest' });
        }
        return;
      }
    }
    // 활성 세션 없으면 이전 스크롤 위치 복원
    if (savedScrollRef.current > 0) {
      el.scrollTop = savedScrollRef.current;
    }
  }, [filteredSessions, activeSessionId]);

  // 스크롤 이벤트로 현재 위치 저장
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      savedScrollRef.current = scrollContainerRef.current.scrollTop;
    }
  };

  const cardBorder = '1px solid rgba(255,255,255,0.08)';

  const toggleChipSx = (active: boolean) => ({
    cursor: 'pointer', fontSize: '0.68rem', height: 26,
    fontWeight: active ? 700 : 400,
    bgcolor: active ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
    color: active ? '#f87171' : '#94a3b8',
    border: active ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.08)',
  });

  return (
    <Box sx={{ width: 340, borderRight: cardBorder, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* 탭 */}
      <Box sx={{ px: 1, pt: 1, pb: 0.5 }}>
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
          {TAB_KEYS.map(key => {
            const count = tabCounts[key];
            const label = key === '중요' ? `\u2B50${key}` : `${key} ${count}`;
            return (
              <Chip
                key={key}
                label={label}
                size="small"
                onClick={() => onTabChange(key)}
                sx={{
                  cursor: 'pointer', fontSize: '0.72rem', height: 26,
                  fontWeight: activeTab === key ? 700 : 400,
                  bgcolor: activeTab === key ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                  color: activeTab === key ? '#60a5fa' : '#94a3b8',
                  border: activeTab === key ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                }}
              />
            );
          })}
        </Stack>
      </Box>

      {/* 날짜 범위 필터 */}
      <Box sx={{ px: 1, pb: 0.5 }}>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.3 }}>
          <CalendarIcon sx={{ fontSize: 14, color: '#64748b' }} />
          {[
            { label: '오늘', days: 0 },
            { label: '3일', days: 3 },
            { label: '7일', days: 7 },
            { label: '30일', days: 30 },
            { label: '전체', days: 365 },
          ].map(opt => {
            const today = new Date().toISOString().slice(0, 10);
            const from = opt.days === 0
              ? today
              : new Date(Date.now() - opt.days * 86400000).toISOString().slice(0, 10);
            const isActive = dateRange.from === from && dateRange.to === today;
            return (
              <Chip
                key={opt.label}
                label={opt.label}
                size="small"
                onClick={() => onDateRangeChange({ from, to: today })}
                sx={{
                  cursor: 'pointer', fontSize: '0.65rem', height: 22,
                  fontWeight: isActive ? 700 : 400,
                  bgcolor: isActive ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)',
                  color: isActive ? '#34d399' : '#94a3b8',
                  border: isActive ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.08)',
                }}
              />
            );
          })}
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => onDateRangeChange({ ...dateRange, from: e.target.value })}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4, color: '#94a3b8', fontSize: '0.7rem', padding: '2px 6px', height: 26,
              colorScheme: 'dark',
            }}
          />
          <Typography sx={{ color: '#475569', fontSize: '0.7rem' }}>~</Typography>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => onDateRangeChange({ ...dateRange, to: e.target.value })}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4, color: '#94a3b8', fontSize: '0.7rem', padding: '2px 6px', height: 26,
              colorScheme: 'dark',
            }}
          />
        </Stack>
      </Box>

      {/* 필터바 1줄: 토글 + 정렬 */}
      <Box sx={{ px: 1, pb: 0.5 }}>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Chip
            icon={<DotIcon sx={{ fontSize: 10, color: filterUnread ? '#ef4444' : '#64748b' }} />}
            label="안읽은"
            size="small"
            onClick={() => onFilterUnreadChange(!filterUnread)}
            sx={toggleChipSx(filterUnread)}
          />
          <Chip
            icon={<DotIcon sx={{ fontSize: 10, color: filterUnanswered ? '#f59e0b' : '#64748b' }} />}
            label="미답변"
            size="small"
            onClick={() => onFilterUnansweredChange(!filterUnanswered)}
            sx={{
              cursor: 'pointer', fontSize: '0.68rem', height: 26,
              fontWeight: filterUnanswered ? 700 : 400,
              bgcolor: filterUnanswered ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)',
              color: filterUnanswered ? '#fbbf24' : '#94a3b8',
              border: filterUnanswered ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(255,255,255,0.08)',
            }}
          />
          <Box sx={{ flex: 1 }} />
          <FormControl size="small" sx={{ minWidth: 110 }}>
            <Select
              value={sortKey}
              onChange={(e) => onSortKeyChange(e.target.value as SortKey)}
              sx={selectSx}
            >
              {SORT_OPTIONS.map(o => (
                <MenuItem key={o.key} value={o.key} sx={menuItemSx}>{o.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Box>

      {/* 필터바 2줄: 드롭다운 3개 */}
      <Box sx={{ px: 1, pb: 0.5 }}>
        <Stack direction="row" spacing={0.5}>
          <FormControl size="small" sx={{ flex: 1 }}>
            <Select
              value={filterChannel}
              onChange={(e) => onFilterChannelChange(e.target.value)}
              displayEmpty
              sx={selectSx}
            >
              <MenuItem value="" sx={menuItemSx}>서비스 전체</MenuItem>
              {channelOptions.map(ch => (
                <MenuItem key={ch} value={ch} sx={menuItemSx}>{channelLabel(ch)}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ flex: 1 }}>
            <Select
              value={filterAgent}
              onChange={(e) => onFilterAgentChange(e.target.value)}
              displayEmpty
              sx={selectSx}
            >
              <MenuItem value="" sx={menuItemSx}>상담원 전체</MenuItem>
              {agentOptions.map(([id, name]) => (
                <MenuItem key={id} value={id} sx={menuItemSx}>{name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ flex: 1 }}>
            <Select
              value={filterTag}
              onChange={(e) => onFilterTagChange(e.target.value)}
              displayEmpty
              sx={selectSx}
            >
              <MenuItem value="" sx={menuItemSx}>태그 전체</MenuItem>
              {tagOptions.map(([key, info]) => (
                <MenuItem key={key} value={key} sx={menuItemSx}>
                  <Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', bgcolor: info.color, mr: 0.8, verticalAlign: 'middle' }} />
                  {info.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Box>

      {/* 활성 필터 표시 */}
      {activeFilterCount > 0 && (
        <Box sx={{ px: 1, pb: 0.5 }}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography variant="caption" sx={{ color: '#60a5fa', fontSize: '0.68rem' }}>
              필터 {activeFilterCount}개 적용 중
            </Typography>
            <Chip
              label="초기화"
              size="small"
              icon={<CloseIcon sx={{ fontSize: 12 }} />}
              onClick={resetFilters}
              sx={{
                cursor: 'pointer', fontSize: '0.62rem', height: 20,
                color: '#94a3b8', bgcolor: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                '& .MuiChip-icon': { color: '#94a3b8' },
              }}
            />
          </Stack>
        </Box>
      )}

      {/* 검색 */}
      <Box sx={{ px: 1, pb: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="이름, 채팅ID, 메시지 검색..."
          value={sessionSearch}
          onChange={(e) => onSearchChange(e.target.value)}
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

      <Box ref={scrollContainerRef} onScroll={handleScroll} sx={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <SessionSkeleton />
        ) : filteredSessions.length === 0 ? (
          <Typography variant="caption" sx={{ color: '#475569', p: 2, display: 'block', textAlign: 'center' }}>
            {activeTab === '중요' ? '별표된 세션이 없습니다' : '세션 없음'}
          </Typography>
        ) : (
          filteredSessions.map((session) => (
            <Box
              key={session.id}
              data-session-id={session.id}
              onClick={() => onSelectSession(session.id)}
              sx={{
                px: 1.5, py: 1, cursor: 'pointer',
                bgcolor: activeSessionId === session.id ? 'rgba(59,130,246,0.1)' : 'transparent',
                borderLeft: activeSessionId === session.id ? '3px solid #3b82f6' : '3px solid transparent',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <IconButton
                  size="small"
                  onClick={(e) => onToggleStar(e, session.id)}
                  sx={{ p: 0.3, color: starred.has(session.id) ? '#f59e0b' : '#475569' }}
                >
                  {starred.has(session.id) ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
                </IconButton>
                <Badge variant="dot" invisible={!unreadSessions.has(session.id)} sx={{ '& .MuiBadge-badge': { bgcolor: '#ef4444' } }}>
                  <Chip
                    label={channelLabel(session.channel_type)}
                    size="small"
                    sx={{
                      bgcolor: `${channelColor(session.channel_type)}22`,
                      color: channelColor(session.channel_type),
                      fontSize: '0.6rem', height: 18,
                    }}
                  />
                </Badge>
                <Typography variant="body2" sx={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                  {sessionSearch
                    ? highlightText(session.customer_name || session.user_chat_id.slice(0, 16), sessionSearch)
                    : (session.customer_name || session.user_chat_id.slice(0, 16))
                  }
                </Typography>
                <Chip
                  label={statusLabel(session.status)}
                  size="small"
                  sx={{ fontSize: '0.58rem', height: 18, bgcolor: `${statusColor(session.status)}22`, color: statusColor(session.status) }}
                />
                <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                  {formatTime(session.last_message_at || session.created_at)}
                </Typography>
              </Stack>
              {session.last_message_text && (
                <Typography
                  variant="caption"
                  sx={{ color: '#64748b', mt: 0.3, fontSize: '0.72rem', pl: 3.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {sessionSearch
                    ? highlightText(session.last_message_text, sessionSearch)
                    : session.last_message_text
                  }
                </Typography>
              )}
              {(() => {
                const seen = new Set<string>();
                const allTags = [...(session.session_tags_data || []), ...(session.customer_tags_data || [])].filter(t => {
                  if (seen.has(t.label)) return false;
                  seen.add(t.label);
                  return true;
                });
                if (allTags.length === 0) return null;
                return (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.3, mt: 0.4, pl: 3.5 }}>
                    {allTags.map(tag => (
                      <Chip key={tag.label} label={tag.label} size="small"
                        sx={{ height: 16, fontSize: '0.58rem', bgcolor: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}44` }}
                      />
                    ))}
                  </Box>
                );
              })()}
            </Box>
          ))
        )}
        {sentinelRef && <div ref={sentinelRef} style={{ height: 1 }} />}
        {loadingMore && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
            <CircularProgress size={20} sx={{ color: '#64748b' }} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
