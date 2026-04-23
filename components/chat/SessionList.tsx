'use client';

import React from 'react';
import { Box, Typography, Stack, Chip, IconButton, TextField, InputAdornment, Badge } from '@mui/material';
import {
  Search as SearchIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
} from '@mui/icons-material';
import type { Session, TabKey } from '@/types/chat';
import { channelLabel, channelColor, statusLabel, statusColor, formatTime } from '@/lib/chat-helpers';
import { highlightText } from '@/lib/highlight';
import SessionSkeleton from './SessionSkeleton';

interface SessionListProps {
  sessions: Session[];
  loading: boolean;
  activeSessionId: number | null;
  activeTab: TabKey;
  sessionSearch: string;
  starred: Set<number>;
  unreadSessions: Set<number>;
  onSelectSession: (id: number) => void;
  onTabChange: (tab: TabKey) => void;
  onSearchChange: (q: string) => void;
  onToggleStar: (e: React.MouseEvent, id: number) => void;
  sentinelRef?: React.RefObject<HTMLDivElement | null>;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: '전체', label: '전체' },
  { key: '신규', label: '신규' },
  { key: '진행중', label: '진행중' },
  { key: '완료', label: '완료' },
  { key: '중요', label: '\u2B50중요' },
];

export default function SessionList({
  sessions, loading, activeSessionId, activeTab, sessionSearch,
  starred, unreadSessions, onSelectSession, onTabChange, onSearchChange, onToggleStar, sentinelRef,
}: SessionListProps) {
  // 필터
  const filteredSessions = sessions.filter(s => {
    if (activeTab === '신규' && s.status !== 'open') return false;
    if (activeTab === '진행중' && s.status !== 'escalated') return false;
    if (activeTab === '완료' && s.status !== 'closed') return false;
    if (activeTab === '중요' && !starred.has(s.id)) return false;
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

  const cardBorder = '1px solid rgba(255,255,255,0.08)';

  return (
    <Box sx={{ width: 340, borderRight: cardBorder, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* 탭 */}
      <Box sx={{ px: 1, pt: 1, pb: 0.5 }}>
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <Chip
              key={t.key}
              label={t.label}
              size="small"
              onClick={() => onTabChange(t.key)}
              sx={{
                cursor: 'pointer', fontSize: '0.72rem', height: 26,
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

      <Box sx={{ flex: 1, overflowY: 'auto' }}>
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
                  sx={{ color: '#64748b', mt: 0.3, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.72rem', pl: 3.5 }}
                >
                  {sessionSearch
                    ? highlightText(session.last_message_text, sessionSearch)
                    : session.last_message_text
                  }
                </Typography>
              )}
            </Box>
          ))
        )}
        {sentinelRef && <div ref={sentinelRef} style={{ height: 1 }} />}
      </Box>
    </Box>
  );
}
