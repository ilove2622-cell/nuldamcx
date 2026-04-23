'use client';

import React from 'react';
import { Box, TextField, Button, Stack, CircularProgress } from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';

interface EscalationPanelProps {
  reason: string;
  escalating: boolean;
  onReasonChange: (reason: string) => void;
  onEscalate: () => void;
}

export default function EscalationPanel({ reason, escalating, onReasonChange, onEscalate }: EscalationPanelProps) {
  return (
    <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          size="small"
          placeholder="에스컬레이션 사유 입력..."
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.ctrlKey && e.shiftKey) {
              e.preventDefault();
              onEscalate();
            }
          }}
          sx={{
            flex: 1,
            '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: 'rgba(255,255,255,0.04)' },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
          }}
        />
        <Button
          size="small" variant="outlined"
          startIcon={escalating ? <CircularProgress size={14} /> : <WarningIcon />}
          disabled={escalating || !reason.trim()}
          onClick={onEscalate}
          sx={{ color: '#ef4444', borderColor: '#ef4444', textTransform: 'none', whiteSpace: 'nowrap' }}
        >
          에스컬레이션
        </Button>
      </Stack>
    </Box>
  );
}
