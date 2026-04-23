'use client';

import React, { useState } from 'react';
import { Box, Typography, Stack, Chip, Button, CircularProgress, TextField, Collapse } from '@mui/material';
import {
  Send as SendIcon,
  Edit as EditIcon,
  SmartToy as SmartToyIcon,
  AutoAwesome as AutoAwesomeIcon,
  NoteAdd as NoteAddIcon,
} from '@mui/icons-material';
import type { AIResponse } from '@/types/chat';
import { confidenceColor } from '@/lib/chat-helpers';

interface DraftPanelProps {
  aiResponses: AIResponse[];
  selectedDraftIdx: number;
  sending: boolean;
  generating?: boolean;
  onSelectDraft: (idx: number) => void;
  onSend: (draft: AIResponse) => void;
  onCopyToEditor: (text: string) => void;
  onGenerate?: (extraContext?: string) => void;
}

export default function DraftPanel({ aiResponses, selectedDraftIdx, sending, generating, onSelectDraft, onSend, onCopyToEditor, onGenerate }: DraftPanelProps) {
  const [showContextInput, setShowContextInput] = useState(false);
  const [extraContext, setExtraContext] = useState('');
  const pendingDrafts = aiResponses.filter(a => !a.sent_at && a.mode?.trim() === 'dryrun');

  const handleGenerate = () => {
    onGenerate?.(extraContext.trim() || undefined);
    setExtraContext('');
    setShowContextInput(false);
  };

  const contextToggleBtn = onGenerate && (
    <Button
      size="small" variant="text"
      startIcon={<NoteAddIcon />}
      onClick={() => setShowContextInput(!showContextInput)}
      sx={{ color: '#10b981', textTransform: 'none', fontSize: '0.75rem', '&:hover': { bgcolor: 'rgba(16,185,129,0.1)' } }}
    >
      {showContextInput ? '참고 접기' : '참고 내용 추가'}
    </Button>
  );

  const contextCollapse = onGenerate && (
    <Collapse in={showContextInput}>
      <TextField
        multiline minRows={2} maxRows={4}
        placeholder="AI에게 전달할 추가 참고 내용을 입력하세요 (예: 이 건은 이미 환불 처리됨, 교환 불가 상품 등)"
        value={extraContext}
        onChange={e => setExtraContext(e.target.value)}
        fullWidth size="small"
        sx={{
          mt: 1,
          '& .MuiOutlinedInput-root': {
            bgcolor: 'rgba(255,255,255,0.04)', color: '#cbd5e1', fontSize: '0.8rem',
            '& fieldset': { borderColor: 'rgba(16,185,129,0.3)' },
            '&:hover fieldset': { borderColor: 'rgba(16,185,129,0.5)' },
            '&.Mui-focused fieldset': { borderColor: '#10b981' },
          },
          '& .MuiInputBase-input::placeholder': { color: '#475569', opacity: 1 },
        }}
      />
    </Collapse>
  );

  if (pendingDrafts.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" sx={{ color: '#475569' }}>
            {aiResponses.length > 0 ? '모든 AI 초안이 발송되었습니다' : '대기 중인 AI 초안이 없습니다'}
          </Typography>
          {onGenerate && (
            <Button
              size="small" variant="outlined"
              startIcon={generating ? <CircularProgress size={14} /> : <AutoAwesomeIcon />}
              disabled={generating}
              onClick={handleGenerate}
              sx={{ color: '#8b5cf6', borderColor: '#8b5cf6', textTransform: 'none', '&:hover': { bgcolor: 'rgba(139,92,246,0.1)' } }}
            >
              {generating ? 'AI 생성 중...' : 'AI 초안 생성'}
            </Button>
          )}
          {contextToggleBtn}
        </Stack>
        {contextCollapse}
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
      <Typography variant="body2" data-selectable sx={{
        whiteSpace: 'pre-wrap', bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 1.5, p: 1.5, mb: 1, fontSize: '0.85rem', color: '#cbd5e1', maxHeight: 120, overflowY: 'auto',
        userSelect: 'text', WebkitUserSelect: 'text',
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
        {onGenerate && (
          <Button
            size="small" variant="outlined"
            startIcon={generating ? <CircularProgress size={14} /> : <AutoAwesomeIcon />}
            disabled={generating}
            onClick={handleGenerate}
            sx={{ color: '#8b5cf6', borderColor: '#8b5cf6', textTransform: 'none', '&:hover': { bgcolor: 'rgba(139,92,246,0.1)' } }}
          >
            {generating ? '생성 중...' : '새 초안'}
          </Button>
        )}
        {contextToggleBtn}
      </Stack>
      {contextCollapse}
    </Box>
  );
}
