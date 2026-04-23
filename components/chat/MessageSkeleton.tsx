'use client';

import React from 'react';
import { Box, Skeleton, Stack } from '@mui/material';

export default function MessageSkeleton({ count = 5 }: { count?: number }) {
  return (
    <Stack spacing={1.5} sx={{ px: 2, py: 1.5 }}>
      {Array.from({ length: count }).map((_, i) => {
        const isRight = i % 3 !== 0;
        return (
          <Box key={i} sx={{ display: 'flex', justifyContent: isRight ? 'flex-end' : 'flex-start' }}>
            <Box sx={{ maxWidth: '60%' }}>
              <Stack direction="row" spacing={0.5} mb={0.3}>
                <Skeleton variant="circular" width={13} height={13} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
                <Skeleton variant="text" width={40} height={13} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
              </Stack>
              <Skeleton
                variant="rounded"
                width={180 + Math.random() * 80}
                height={40 + Math.random() * 20}
                sx={{ bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 2 }}
              />
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
