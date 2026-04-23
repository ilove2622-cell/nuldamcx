'use client';

import React from 'react';
import { Box, TextField, Button, Stack, CircularProgress } from '@mui/material';
import { Send as SendIcon } from '@mui/icons-material';

interface MessageInputProps {
  freeText: string;
  sending: boolean;
  onTextChange: (text: string) => void;
  onSend: () => void;
}

export default function MessageInput({ freeText, sending, onTextChange, onSend }: MessageInputProps) {
  return (
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
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
              e.preventDefault();
              onSend();
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
          onClick={onSend}
          sx={{ bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' }, textTransform: 'none', whiteSpace: 'nowrap', minWidth: 80 }}
        >
          발송
        </Button>
      </Stack>
    </Box>
  );
}
