'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, IconButton, TextField, Chip, Collapse, Tooltip,
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Edit as EditIcon,
  Close as CloseIcon,
  NoteAdd as NoteAddIcon,
  Photo as PhotoIcon,
  PhotoCamera as PhotoCameraIcon,
  Videocam as VideocamIcon,
  AttachFile as AttachFileIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { parseMessageBlocks } from '@/lib/chat-helpers';
import type { Session, Message, CustomerProfile, CustomerTag, SessionNote, FileAttachment } from '@/types/chat';

interface Props {
  session: Session;
  messages: Message[];
  open: boolean;
  onToggle: () => void;
  onImageClick?: (url: string) => void;
  onScrollToMessage?: (messageId: number) => void;
  onShowDesk?: () => void;
}

const cardBorder = '1px solid rgba(255,255,255,0.08)';

// ─── 접기/펼치기 섹션 ───
function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box sx={{ borderBottom: cardBorder }}>
      <Box
        onClick={() => setOpen(v => !v)}
        sx={{ px: 1.5, py: 0.8, display: 'flex', alignItems: 'center', cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}
      >
        {open ? <ExpandMoreIcon sx={{ fontSize: 16, color: '#64748b', mr: 0.5 }} /> : <ChevronRightIcon sx={{ fontSize: 16, color: '#64748b', mr: 0.5 }} />}
        <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Typography>
      </Box>
      <Collapse in={open}>
        <Box sx={{ px: 1.5, pb: 1.2 }}>{children}</Box>
      </Collapse>
    </Box>
  );
}

// ─── 인라인 편집 필드 ───
function InlineField({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  const commit = () => {
    if (draft !== (value || '')) onSave(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
        <Typography variant="caption" sx={{ color: '#64748b', width: 52, flexShrink: 0, fontSize: '0.7rem' }}>{label}</Typography>
        <TextField
          size="small"
          variant="standard"
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          slotProps={{ input: { sx: { color: '#f8fafc', fontSize: '0.75rem', py: 0 } } }}
          sx={{ flex: 1 }}
        />
      </Stack>
    );
  }

  return (
    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5, '&:hover .edit-btn': { opacity: 1 } }}>
      <Typography variant="caption" sx={{ color: '#64748b', width: 52, flexShrink: 0, fontSize: '0.7rem' }}>{label}</Typography>
      <Typography variant="caption" sx={{ color: '#e2e8f0', fontSize: '0.75rem', flex: 1 }}>{value || '—'}</Typography>
      <IconButton className="edit-btn" size="small" onClick={() => { setDraft(value || ''); setEditing(true); }} sx={{ opacity: 0, color: '#64748b', p: 0.2, transition: 'opacity 0.15s' }}>
        <EditIcon sx={{ fontSize: 13 }} />
      </IconButton>
    </Stack>
  );
}

// ─── 태그 색상 프리셋 ───
const TAG_COLORS: Record<string, string> = {
  'VIP': '#f59e0b',
  '주의': '#ef4444',
  '단골': '#10b981',
  '신규': '#3b82f6',
  '일반': '#3b82f6',
};

export default function CustomerSidebar({ session, messages, open, onToggle, onImageClick, onScrollToMessage, onShowDesk }: Props) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [tags, setTags] = useState<CustomerTag[]>([]);
  const [sessionHistory, setSessionHistory] = useState<any[]>([]);
  const [notes, setNotes] = useState<SessionNote[]>([]);
  const [loading, setLoading] = useState(false);

  // 입력 상태
  const [tagInput, setTagInput] = useState('');
  const [noteInput, setNoteInput] = useState('');

  const customerId = session.customer_id;

  // ─── 데이터 로드 ───
  const fetchData = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const [custRes, notesRes] = await Promise.all([
        fetch(`/api/chat/customer?customerId=${encodeURIComponent(customerId)}`).then(r => r.json()),
        fetch(`/api/chat/notes?sessionId=${session.id}`).then(r => r.json()),
      ]);
      setProfile(custRes.profile || null);
      setTags(custRes.tags || []);
      setSessionHistory(custRes.sessionHistory || []);
      setNotes(notesRes.notes || []);
    } catch (e) {
      console.error('사이드바 데이터 로드 실패:', e);
    }
    setLoading(false);
  }, [customerId, session.id]);

  useEffect(() => { if (open) fetchData(); }, [open, fetchData]);

  // ─── 프로필 수정 ───
  const handleProfileSave = async (field: string, value: string) => {
    if (!customerId) return;
    const prev = profile;
    // 낙관적 업데이트
    setProfile(p => p ? { ...p, [field]: value } : { id: 0, customer_id: customerId, name: null, phone: null, email: null, member_id: null, last_visit: null, created_at: '', updated_at: '', [field]: value });
    try {
      const res = await fetch('/api/chat/customer', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, updates: { [field]: value } }),
      });
      if (!res.ok) throw new Error();
      const { profile: updated } = await res.json();
      setProfile(updated);
    } catch {
      setProfile(prev);
    }
  };

  // ─── 태그 추가 ───
  const handleAddTag = async () => {
    if (!customerId || !tagInput.trim()) return;
    const label = tagInput.trim();
    setTagInput('');
    // 카테고리:라벨 형식 지원
    const parts = label.split(':');
    const category = parts.length > 1 ? parts[0] : '일반';
    const tagLabel = parts.length > 1 ? parts.slice(1).join(':') : label;
    const color = TAG_COLORS[category] || '#3b82f6';

    const optimistic: CustomerTag = { id: Date.now(), customer_id: customerId, label: tagLabel, category, color, created_at: new Date().toISOString() };
    setTags(prev => [optimistic, ...prev]);

    try {
      const res = await fetch('/api/chat/customer/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, label: tagLabel, category, color }),
      });
      if (!res.ok) throw new Error();
      const { tag } = await res.json();
      setTags(prev => prev.map(t => t.id === optimistic.id ? tag : t));
    } catch {
      setTags(prev => prev.filter(t => t.id !== optimistic.id));
    }
  };

  // ─── 태그 삭제 ───
  const handleDeleteTag = async (tagId: number) => {
    const prev = tags;
    setTags(t => t.filter(x => x.id !== tagId));
    try {
      const res = await fetch('/api/chat/customer/tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTags(prev);
    }
  };

  // ─── 메모 추가 ───
  const handleAddNote = async () => {
    if (!noteInput.trim()) return;
    const text = noteInput.trim();
    setNoteInput('');

    const optimistic: SessionNote = { id: Date.now(), session_id: session.id, text, author: null, created_at: new Date().toISOString() };
    setNotes(prev => [optimistic, ...prev]);

    try {
      const res = await fetch('/api/chat/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, text }),
      });
      if (!res.ok) throw new Error();
      const { note } = await res.json();
      setNotes(prev => prev.map(n => n.id === optimistic.id ? note : n));
    } catch {
      setNotes(prev => prev.filter(n => n.id !== optimistic.id));
    }
  };

  // ─── 메모 삭제 ───
  const handleDeleteNote = async (noteId: number) => {
    const prev = notes;
    setNotes(n => n.filter(x => x.id !== noteId));
    try {
      const res = await fetch('/api/chat/notes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setNotes(prev);
    }
  };

  // ─── 첨부파일 추출 ───
  const attachments: FileAttachment[] = [];
  for (const msg of messages) {
    const blocks = parseMessageBlocks(msg.text);
    for (const b of blocks) {
      if (b.type === 'image') attachments.push({ type: 'image', name: 'image', url: b.url, messageId: msg.id, createdAt: msg.created_at });
      else if (b.type === 'photo') attachments.push({ type: 'photo', name: b.name, messageId: msg.id, createdAt: msg.created_at });
      else if (b.type === 'video-url') attachments.push({ type: 'video-url', name: 'video', url: b.url, messageId: msg.id, createdAt: msg.created_at });
      else if (b.type === 'video') attachments.push({ type: 'video', name: b.name, messageId: msg.id, createdAt: msg.created_at });
      else if (b.type === 'file') attachments.push({ type: 'file', name: b.name, messageId: msg.id, createdAt: msg.created_at });
    }
  }
  const photoCount = attachments.filter(a => a.type === 'image' || a.type === 'photo').length;
  const fileCount = attachments.filter(a => a.type === 'file').length;
  const videoCount = attachments.filter(a => a.type === 'video' || a.type === 'video-url').length;

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };
  const fmtDateTime = (iso: string) => {
    const d = new Date(iso);
    return `${fmtDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // 접힌 상태 — 열기 버튼만
  if (!open) {
    return (
      <Box sx={{ width: 32, borderLeft: cardBorder, display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 1, bgcolor: 'rgba(255,255,255,0.02)' }}>
        <Tooltip title="고객 정보" placement="left">
          <IconButton size="small" onClick={onToggle} sx={{ color: '#64748b' }}>
            <ChevronLeftIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }

  return (
    <Box sx={{ width: 320, minWidth: 320, borderLeft: cardBorder, display: 'flex', flexDirection: 'column', bgcolor: 'rgba(255,255,255,0.02)', overflowY: 'auto' }}>
      {/* 헤더 */}
      <Box sx={{ px: 1.5, py: 0.8, borderBottom: cardBorder, display: 'flex', alignItems: 'center' }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.78rem', flex: 1 }}>고객 정보</Typography>
        <IconButton size="small" onClick={onToggle} sx={{ color: '#64748b', p: 0.3 }}>
          <ChevronRightIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {loading && (
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Typography variant="caption" sx={{ color: '#475569' }}>로딩 중...</Typography>
        </Box>
      )}

      {/* 기본 정보 */}
      <Section title="기본 정보">
        {!customerId ? (
          <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.7rem' }}>고객 ID 없음</Typography>
        ) : (
          <>
            <InlineField label="이름" value={profile?.name ?? session.customer_name} onSave={v => handleProfileSave('name', v)} />
            <InlineField label="연락처" value={profile?.phone ?? null} onSave={v => handleProfileSave('phone', v)} />
            <InlineField label="이메일" value={profile?.email ?? null} onSave={v => handleProfileSave('email', v)} />
            <InlineField label="회원ID" value={profile?.member_id ?? null} onSave={v => handleProfileSave('member_id', v)} />
            {profile?.last_visit && (
              <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                <Typography variant="caption" sx={{ color: '#64748b', width: 52, fontSize: '0.7rem' }}>접속일</Typography>
                <Typography variant="caption" sx={{ color: '#e2e8f0', fontSize: '0.75rem' }}>{fmtDate(profile.last_visit)}</Typography>
              </Stack>
            )}
          </>
        )}
      </Section>

      {/* 고객 태그 */}
      <Section title="고객 태그">
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.8 }}>
          {tags.map(tag => (
            <Chip
              key={tag.id}
              label={tag.category !== '일반' ? `${tag.category}: ${tag.label}` : tag.label}
              size="small"
              onDelete={() => handleDeleteTag(tag.id)}
              deleteIcon={<CloseIcon sx={{ fontSize: '12px !important' }} />}
              sx={{
                bgcolor: `${tag.color}22`,
                color: tag.color,
                borderColor: `${tag.color}44`,
                border: 1,
                fontSize: '0.68rem',
                height: 22,
                '& .MuiChip-deleteIcon': { color: `${tag.color}88`, fontSize: 12 },
              }}
            />
          ))}
          {tags.length === 0 && <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.68rem' }}>태그 없음</Typography>}
        </Box>
        <TextField
          size="small"
          variant="outlined"
          placeholder="카테고리:태그 입력 후 Enter"
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
          fullWidth
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: 'rgba(255,255,255,0.04)',
              '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
              '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
              '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
            },
            '& .MuiInputBase-input': { color: '#e2e8f0', fontSize: '0.72rem', py: 0.6, px: 1 },
          }}
        />
      </Section>

      {/* 내부 메모 */}
      <Section title="내부 메모">
        <Stack spacing={0.5} sx={{ mb: 0.8 }}>
          {notes.map(note => (
            <Stack key={note.id} direction="row" alignItems="flex-start" spacing={0.5} sx={{ '&:hover .del-btn': { opacity: 1 } }}>
              <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.65rem', whiteSpace: 'nowrap', pt: 0.2 }}>{fmtDateTime(note.created_at)}</Typography>
              <Typography variant="caption" sx={{ color: '#e2e8f0', fontSize: '0.72rem', flex: 1, lineHeight: 1.4 }}>{note.text}</Typography>
              <IconButton className="del-btn" size="small" onClick={() => handleDeleteNote(note.id)} sx={{ opacity: 0, color: '#64748b', p: 0.2, transition: 'opacity 0.15s' }}>
                <CloseIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Stack>
          ))}
          {notes.length === 0 && <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.68rem' }}>메모 없음</Typography>}
        </Stack>
        <TextField
          size="small"
          variant="outlined"
          placeholder="메모 입력 후 Enter"
          value={noteInput}
          onChange={e => setNoteInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddNote(); } }}
          fullWidth
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: 'rgba(255,255,255,0.04)',
              '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
              '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
              '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
            },
            '& .MuiInputBase-input': { color: '#e2e8f0', fontSize: '0.72rem', py: 0.6, px: 1 },
          }}
        />
      </Section>

      {/* 상담 태그 */}
      <Section title="상담 태그" defaultOpen={false}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {(session.tags || []).map((tag, i) => (
            <Chip
              key={i}
              label={tag}
              size="small"
              sx={{ bgcolor: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontSize: '0.68rem', height: 22 }}
            />
          ))}
          {(!session.tags || session.tags.length === 0) && (
            <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.68rem' }}>태그 없음</Typography>
          )}
        </Box>
      </Section>

      {/* 상담 이력 */}
      <Section title="상담 이력">
        <Stack spacing={0.3}>
          {sessionHistory.map((h: any) => (
            <Box key={h.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.3 }}>
              <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.65rem', fontFamily: 'monospace' }}>#{h.id}</Typography>
              <Chip
                label={h.status === 'closed' ? '완료' : h.status === 'escalated' ? '전달' : '진행'}
                size="small"
                sx={{
                  height: 16, fontSize: '0.6rem',
                  bgcolor: h.status === 'closed' ? 'rgba(16,185,129,0.15)' : h.status === 'escalated' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                  color: h.status === 'closed' ? '#10b981' : h.status === 'escalated' ? '#ef4444' : '#3b82f6',
                }}
              />
              <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.65rem' }}>{fmtDate(h.created_at)}</Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.68rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {h.last_message_text ? (h.last_message_text.length > 25 ? h.last_message_text.slice(0, 25) + '…' : h.last_message_text) : '—'}
              </Typography>
            </Box>
          ))}
          {sessionHistory.length === 0 && <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.68rem' }}>이력 없음</Typography>}
        </Stack>
      </Section>

      {/* 첨부파일 */}
      <Section title={`첨부파일${attachments.length > 0 ? ` (${attachments.length})` : ''}`} defaultOpen={false}>
        {attachments.length === 0 ? (
          <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.68rem' }}>없음</Typography>
        ) : (
          <>
            {/* 이미지 그리드 (직접 URL 있는 것) */}
            {attachments.filter(a => a.type === 'image' && a.url).length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                {attachments.filter(a => a.type === 'image' && a.url).map((a, i) => (
                  <Box
                    key={`img-${i}`}
                    component="img"
                    src={a.url}
                    onClick={() => onImageClick?.(a.url!)}
                    sx={{
                      width: 64, height: 64, objectFit: 'cover', borderRadius: 1,
                      cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)',
                      '&:hover': { opacity: 0.8, borderColor: '#3b82f6' },
                    }}
                  />
                ))}
              </Box>
            )}
            {/* 개별 첨부파일 리스트 */}
            <Stack spacing={0.3}>
              {attachments.map((a, i) => {
                if (a.type === 'image' && a.url) return null; // 위 그리드에서 이미 표시
                const icon = (a.type === 'photo' || a.type === 'image')
                  ? <PhotoCameraIcon sx={{ fontSize: 14, color: '#60a5fa' }} />
                  : (a.type === 'video' || a.type === 'video-url')
                    ? <VideocamIcon sx={{ fontSize: 14, color: '#a78bfa' }} />
                    : <AttachFileIcon sx={{ fontSize: 14, color: '#94a3b8' }} />;
                const label = (a.type === 'photo' || a.type === 'image') ? '사진'
                  : (a.type === 'video' || a.type === 'video-url') ? '동영상'
                    : a.name || '파일';
                const handleClick = () => {
                  if (a.type === 'video-url' && a.url) {
                    onImageClick?.(a.url);
                  } else if (a.type === 'photo' || a.type === 'video' || a.type === 'file') {
                    // 채널톡 파일 → 데스크 패널 열기 + 해당 메시지로 스크롤
                    onShowDesk?.();
                    onScrollToMessage?.(a.messageId);
                  } else {
                    onScrollToMessage?.(a.messageId);
                  }
                };
                return (
                  <Box
                    key={`att-${i}`}
                    onClick={handleClick}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 0.5, py: 0.4, px: 0.5,
                      borderRadius: 1, cursor: 'pointer',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                    }}
                  >
                    {icon}
                    <Typography variant="caption" sx={{ color: '#e2e8f0', fontSize: '0.7rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}{a.name && a.name !== label ? ` — ${a.name}` : ''}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.6rem' }}>{fmtDateTime(a.createdAt)}</Typography>
                    <OpenInNewIcon sx={{ fontSize: 11, color: '#475569' }} />
                  </Box>
                );
              }).filter(Boolean)}
            </Stack>
          </>
        )}
      </Section>
    </Box>
  );
}
