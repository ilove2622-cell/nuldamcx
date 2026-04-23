'use client';

import React from 'react';
import { Box, Typography, Stack } from '@mui/material';
import {
  Person as PersonIcon,
  SmartToy as SmartToyIcon,
  HeadsetMic as HeadsetMicIcon,
  PhotoCamera as PhotoCameraIcon,
  Videocam as VideocamIcon,
  AttachFile as AttachFileIcon,
} from '@mui/icons-material';
import type { Message, MessageBlock } from '@/types/chat';
import { formatTime, parseMessageBlocks } from '@/lib/chat-helpers';

interface MessageRendererProps {
  message: Message;
  onImageClick?: (url: string) => void;
  onShowDesk?: () => void;
}

function BlockRenderer({ block, onImageClick, onShowDesk }: { block: MessageBlock; onImageClick?: (url: string) => void; onShowDesk?: () => void }) {
  switch (block.type) {
    case 'image':
      return (
        <Box
          component="img"
          src={block.url}
          onClick={() => onImageClick?.(block.url)}
          sx={{ maxWidth: '100%', maxHeight: 200, borderRadius: 1, mt: 0.5, cursor: 'pointer', '&:hover': { opacity: 0.85 } }}
        />
      );
    case 'photo':
      return (
        <Box onClick={onShowDesk} sx={{
          mt: 0.5, p: 1, borderRadius: 1.5, cursor: 'pointer',
          bgcolor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
          display: 'inline-flex', alignItems: 'center', gap: 1,
          '&:hover': { bgcolor: 'rgba(59,130,246,0.15)' },
        }}>
          <PhotoCameraIcon sx={{ fontSize: 22, color: '#60a5fa' }} />
          <Typography variant="caption" sx={{ color: '#93c5fd', fontWeight: 600 }}>
            사진 첨부{block.dims ? ` (${block.dims})` : ''}
          </Typography>
          <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.6rem' }}>클릭하여 확인</Typography>
        </Box>
      );
    case 'video-url':
      return (
        <Box component="video" controls src={block.url}
          sx={{ maxWidth: '100%', maxHeight: 240, borderRadius: 1, mt: 0.5 }} />
      );
    case 'video':
      return (
        <Box onClick={onShowDesk} sx={{
          mt: 0.5, p: 1, borderRadius: 1.5, cursor: 'pointer',
          bgcolor: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
          display: 'inline-flex', alignItems: 'center', gap: 1,
          '&:hover': { bgcolor: 'rgba(139,92,246,0.15)' },
        }}>
          <VideocamIcon sx={{ fontSize: 22, color: '#a78bfa' }} />
          <Typography variant="caption" sx={{ color: '#c4b5fd', fontWeight: 600 }}>
            동영상{block.duration ? ` (${block.duration})` : ''}{block.name ? ` ${block.name}` : ''}
          </Typography>
          <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.6rem' }}>클릭하여 확인</Typography>
        </Box>
      );
    case 'file':
      return (
        <Box onClick={onShowDesk} sx={{
          mt: 0.5, p: 1, borderRadius: 1.5, cursor: 'pointer',
          bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
          display: 'inline-flex', alignItems: 'center', gap: 1,
          '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
        }}>
          <AttachFileIcon sx={{ fontSize: 20, color: '#94a3b8' }} />
          <Typography variant="caption" sx={{ color: '#cbd5e1', fontWeight: 600 }}>
            {block.name || '첨부파일'}{block.size ? ` (${block.size})` : ''}
          </Typography>
          <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.6rem' }}>클릭하여 확인</Typography>
        </Box>
      );
    case 'text':
      return <>{block.content}</>;
    default:
      return null;
  }
}

export default function MessageRenderer({ message, onImageClick, onShowDesk }: MessageRendererProps) {
  const isCustomer = message.sender === 'customer';
  const blocks = parseMessageBlocks(message.text);

  return (
    <Box sx={{ display: 'flex', justifyContent: isCustomer ? 'flex-start' : 'flex-end', opacity: message._optimistic ? 0.6 : 1 }}>
      <Box sx={{
        maxWidth: '65%',
        px: 1.5, py: 1,
        borderRadius: 2,
        bgcolor: isCustomer ? 'rgba(251,191,36,0.10)' : 'rgba(59,130,246,0.12)',
        border: isCustomer ? '1px solid rgba(251,191,36,0.25)' : '1px solid rgba(59,130,246,0.25)',
      }}>
        <Stack direction="row" spacing={0.5} alignItems="center" mb={0.3}>
          {isCustomer
            ? <PersonIcon sx={{ fontSize: 13, color: '#94a3b8' }} />
            : message.sender === 'bot'
              ? <SmartToyIcon sx={{ fontSize: 13, color: '#3b82f6' }} />
              : <HeadsetMicIcon sx={{ fontSize: 13, color: '#8b5cf6' }} />
          }
          <Typography variant="caption" sx={{ color: '#64748b' }}>
            {isCustomer ? '고객' : message.sender === 'bot' ? 'AI 봇' : '상담사'}
          </Typography>
          <Typography variant="caption" sx={{ color: '#475569' }}>
            {formatTime(message.created_at)}
          </Typography>
        </Stack>
        <Typography variant="body2" component="div" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', color: isCustomer ? '#fef3c7' : '#e2e8f0' }}>
          {blocks.map((block, i) => (
            <BlockRenderer key={i} block={block} onImageClick={onImageClick} onShowDesk={onShowDesk} />
          ))}
        </Typography>
      </Box>
    </Box>
  );
}
