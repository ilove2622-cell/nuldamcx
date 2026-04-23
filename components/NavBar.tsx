'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  Box, Container, Typography, Stack, Button, Breadcrumbs
} from '@mui/material';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import BiotechIcon from '@mui/icons-material/Biotech';
import HeadsetMicIcon from '@mui/icons-material/HeadsetMic';
import BarChartIcon from '@mui/icons-material/BarChart';
import InboxIcon from '@mui/icons-material/Inbox';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SettingsIcon from '@mui/icons-material/Settings';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

const NAV_ITEMS = [
  { path: '/chat/console', label: '채팅상담', icon: <HeadsetMicIcon fontSize="small" /> },
  { path: '/board', label: '게시판', icon: <InboxIcon fontSize="small" /> },
  { path: '/analytics', label: '분석', icon: <TrendingUpIcon fontSize="small" /> },
  { path: '/status', label: '문의현황', icon: <BarChartIcon fontSize="small" /> },
  { path: '/voc', label: 'VOC', icon: <BiotechIcon fontSize="small" /> },
  { path: '/ocr', label: 'OCR', icon: <DocumentScannerIcon fontSize="small" /> },
  { path: '/settings', label: '설정', icon: <SettingsIcon fontSize="small" /> },
];

// 경로 → 라벨 매핑
const BREADCRUMB_MAP: Record<string, string> = {
  '/chat/console': '채팅상담',
  '/board': '게시판',
  '/analytics': '분석',
  '/ocr': 'OCR',
  '/voc': 'VOC',
  '/status': '문의현황',
  '/settings': '설정',
};

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === '/login') return null;

  // Breadcrumbs 생성
  const pathParts = pathname.split('/').filter(Boolean);
  const crumbs: Array<{ label: string; path: string }> = [];
  let accumulated = '';
  for (const part of pathParts) {
    accumulated += `/${part}`;
    const label = BREADCRUMB_MAP[accumulated];
    if (label) crumbs.push({ label, path: accumulated });
  }

  return (
    <Box
      component="nav"
      sx={{
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        backdropFilter: 'blur(10px)',
        bgcolor: 'rgba(15, 23, 42, 0.8)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <Container maxWidth="xl" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5, px: { xs: 1.5, sm: 3, lg: 4 }, gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flexShrink: 1 }}>
          <Box
            onClick={() => router.push('/analytics')}
            sx={{ display: 'flex', alignItems: 'baseline', gap: 1, cursor: 'pointer' }}
          >
            <Typography sx={{ fontWeight: 800, letterSpacing: '-1px', fontSize: { xs: '1.1rem', md: '1.5rem' }, whiteSpace: 'nowrap' }}>
              <span style={{ color: '#3b82f6' }}>N</span>uldam <span style={{ color: '#94a3b8', fontWeight: 300 }}>CX</span>
            </Typography>
          </Box>
          {crumbs.length > 0 && (
            <Breadcrumbs
              separator={<NavigateNextIcon sx={{ fontSize: 14, color: '#475569' }} />}
              sx={{ ml: 2, display: { xs: 'none', md: 'flex' } }}
            >
              {crumbs.map((crumb, i) => (
                <Typography
                  key={crumb.path}
                  variant="caption"
                  onClick={i < crumbs.length - 1 ? () => router.push(crumb.path) : undefined}
                  sx={{
                    color: i === crumbs.length - 1 ? '#94a3b8' : '#64748b',
                    cursor: i < crumbs.length - 1 ? 'pointer' : 'default',
                    fontWeight: i === crumbs.length - 1 ? 600 : 400,
                    '&:hover': i < crumbs.length - 1 ? { color: '#cbd5e1' } : {},
                  }}
                >
                  {crumb.label}
                </Typography>
              ))}
            </Breadcrumbs>
          )}
          <Typography variant="caption" sx={{ color: '#64748b', ml: 1, letterSpacing: '1px', display: { xs: 'none', lg: 'inline' } }}>
            INTEGRATED WORKSPACE
          </Typography>
        </Box>

        <Stack direction="row" spacing={{ xs: 0.5, md: 1.5 }} sx={{ flexShrink: 0 }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
            return (
              <Button
                key={item.path}
                onClick={() => router.push(item.path)}
                startIcon={item.icon}
                sx={{
                  color: isActive ? '#3b82f6' : '#cbd5e1',
                  fontWeight: isActive ? 700 : 600,
                  fontSize: { xs: '0.75rem', md: '0.875rem' },
                  px: { xs: 1, md: 2 },
                  minWidth: 0,
                  borderRadius: '8px',
                  bgcolor: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  '& .MuiButton-startIcon': { mr: { xs: 0.3, md: 1 } },
                  '&:hover': { bgcolor: isActive ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)' }
                }}
              >
                {item.label}
              </Button>
            );
          })}
        </Stack>
      </Container>
    </Box>
  );
}
