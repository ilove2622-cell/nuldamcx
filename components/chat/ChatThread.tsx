'use client';

import React from 'react';
import { Box, Typography, Stack } from '@mui/material';
import type { Message } from '@/types/chat';
import MessageRenderer from './MessageRenderer';
import MessageSkeleton from './MessageSkeleton';

interface ChatThreadProps {
  messages: Message[];
  loading: boolean;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  onImageClick: (url: string) => void;
  onShowDesk: () => void;
}

export default function ChatThread({ messages, loading, chatEndRef, onImageClick, onShowDesk }: ChatThreadProps) {
  if (loading) return <MessageSkeleton />;

  if (messages.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: '#475569', textAlign: 'center', display: 'block', py: 4 }}>
        메시지가 없습니다
      </Typography>
    );
  }

  return (
    <Stack spacing={1}>
      {messages.map((msg) => (
        <MessageRenderer
          key={msg.id}
          message={msg}
          onImageClick={onImageClick}
          onShowDesk={onShowDesk}
        />
      ))}
      <div ref={chatEndRef} />
    </Stack>
  );
}
