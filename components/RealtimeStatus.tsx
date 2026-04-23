'use client';

import React from 'react';
import { Box, Tooltip } from '@mui/material';

type ConnectionState = 'connected' | 'connecting' | 'disconnected';

interface RealtimeStatusProps {
  state: ConnectionState;
}

const COLORS: Record<ConnectionState, string> = {
  connected: '#10b981',
  connecting: '#f59e0b',
  disconnected: '#ef4444',
};

const LABELS: Record<ConnectionState, string> = {
  connected: '실시간 연결됨',
  connecting: '연결 중...',
  disconnected: '연결 끊김 (폴링 모드)',
};

export default function RealtimeStatus({ state }: RealtimeStatusProps) {
  return (
    <Tooltip title={LABELS[state]} arrow placement="bottom">
      <Box sx={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        bgcolor: COLORS[state],
        boxShadow: `0 0 6px ${COLORS[state]}`,
        animation: state === 'connecting' ? 'pulse 1.5s infinite' : 'none',
        '@keyframes pulse': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.4 },
        },
      }} />
    </Tooltip>
  );
}
