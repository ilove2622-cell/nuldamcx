'use client';

import React from 'react';
import { Box, Typography, Stack, Chip, Button, CircularProgress } from '@mui/material';
import {
  Send as SendIcon,
  Edit as EditIcon,
  SmartToy as SmartToyIcon,
} from '@mui/icons-material';
import type { AIResponse } from '@/types/chat';
import { confidenceColor } from '@/lib/chat-helpers';

interface DraftPanelProps {
  aiResponses: AIResponse[];
  selectedDraftIdx: number;
  sending: boolean;
  onSelectDraft: (idx: number) => void;
  onSend: (draft: AIResponse) => void;
  onCopyToEditor: (text: string) => void;
}

export default function DraftPanel({ aiResponses, selectedDraftIdx, sending, onSelectDraft, onSend, onCopyToEditor }: DraftPanelProps) {
  const pendingDrafts = aiResponses.filter(a => !a.sent_at && a.mode?.trim() === 'dryrun');

  if (pendingDrafts.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" sx={{ color: '#475569' }}>
          {aiResponses.length > 0 ? '모든 AI 초안이 발송되었습니다' : '대기 중인 AI 초안이 없습니다'}
        </Typography>
      </Box>
    );
  }

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
              onClick={() => onSelectDraft(i)}
              sx={{
                cursor: 'pointer', fontSize: '0.7rem', height: 24,
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
          sx={{ bgcolor: `${confidenceColor(draft.confidence)}22`, color: confidenceColor(draft.confidence), fontWeight: 700, fontSize: '0.65rem', height: 20 }}
        />
        {draft.escalate && (
          <Chip label="에스컬레이션 권장" size="small" sx={{ bgcolor: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: '0.65rem', height: 20 }} />
        )}
      </Stack>

      {/* 초안 텍스트 */}
      <Typography variant="body2" sx={{
        whiteSpace: 'pre-wrap', bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 1.5, p: 1.5, mb: 1, fontSize: '0.85rem', color: '#cbd5e1', maxHeight: 120, overflowY: 'auto',
      }}>
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
          size="small" variant="contained"
          startIcon={sending ? <CircularProgress size={14} /> : <SendIcon />}
          disabled={sending}
          onClick={() => onSend(draft)}
          sx={{ bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' }, textTransform: 'none' }}
        >
          승인 발송
        </Button>
        <Button
          size="small" variant="outlined"
          startIcon={<EditIcon />}
          onClick={() => onCopyToEditor(draft.answer)}
          sx={{ color: '#f59e0b', borderColor: '#f59e0b', textTransform: 'none' }}
        >
          초안 복사
        </Button>
      </Stack>
    </Box>
  );
}
