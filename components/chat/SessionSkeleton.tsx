'use client';

import React from 'react';
import { Box, Skeleton, Stack } from '@mui/material';

export default function SessionSkeleton({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Box key={i} sx={{ px: 1.5, py: 1, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Skeleton variant="rounded" width={50} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
            <Skeleton variant="text" width={100} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.06)', flex: 1 }} />
            <Skeleton variant="rounded" width={36} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
          </Stack>
          <Skeleton variant="text" width="70%" height={14} sx={{ bgcolor: 'rgba(255,255,255,0.04)', mt: 0.5, ml: 3.5 }} />
        </Box>
      ))}
    </>
  );
}
