'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // ★ Supabase 불러오기

// MUI Components
import {
  Box, Container, Typography, Grid, Button, Fade, Card, CardContent, Stack, Menu, MenuItem,
} from '@mui/material';

// MUI Icons
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import InboxIcon from '@mui/icons-material/Inbox';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RateReviewIcon from '@mui/icons-material/RateReview';

export default function DashboardHome() {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  
  // ★ DB 상태값을 담을 State
  const [counts, setCounts] = useState({
    total: 0,
    pending: 0,   // 대기중
    completed: 0, // 처리완료
    reviewing: 0  // 검토중
  });

  // ★ Supabase에서 데이터 개수 불러오기
  useEffect(() => {
    const fetchCounts = async () => {
      // 1. 전체 데이터 개수
      const { count: totalCount } = await supabase
        .from('inquiries')
        .select('*', { count: 'exact', head: true });

      // 2. '대기중' 개수
      const { count: pendingCount } = await supabase
        .from('inquiries')
        .select('*', { count: 'exact', head: true })
        .eq('status', '대기중');

      // 3. '처리완료' 개수
      const { count: completedCount } = await supabase
        .from('inquiries')
        .select('*', { count: 'exact', head: true })
        .eq('status', '처리완료');

      // 4. '검토중' 개수
      const { count: reviewingCount } = await supabase
        .from('inquiries')
        .select('*', { count: 'exact', head: true })
        .eq('status', '검토중');

      setCounts({
        total: totalCount || 0,
        pending: pendingCount || 0,
        completed: completedCount || 0,
        reviewing: reviewingCount || 0,
      });
    };

    fetchCounts();
  }, []);

  // 카드 렌더링 데이터
  const SUMMARY_DATA = [
    { title: '전체 문의', count: counts.total, icon: <InboxIcon fontSize="large" />, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
    { title: '대기중', count: counts.pending, icon: <HourglassEmptyIcon fontSize="large" />, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
    { title: '처리완료', count: counts.completed, icon: <CheckCircleOutlineIcon fontSize="large" />, color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
    { title: '검토중', count: counts.reviewing, icon: <RateReviewIcon fontSize="large" />, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' },
  ];

  const handleMenuClick = (event: React.MouseEvent<HTMLButtonElement>) => setAnchorEl(event.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'transparent', color: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      {/* 1. 상단 네비게이션 바 */}
      <Box component="header" sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', bgcolor: 'rgba(15, 23, 42, 0.6)', position: 'sticky', top: 0, zIndex: 50 }}>
        <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-1px' }}>
              <span style={{ color: '#3b82f6' }}>N</span>uldam <span style={{ color: '#94a3b8', fontWeight: 300 }}>CX</span>
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b', ml: 1, letterSpacing: '1px' }}>DASHBOARD</Typography>
          </Box>

          <Stack direction="row" spacing={2}>
            <Button onClick={handleMenuClick} endIcon={<KeyboardArrowDownIcon />} sx={{ color: '#cbd5e1', fontWeight: 600, '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.05)' } }}>
              전체보기
            </Button>
            <Menu anchorEl={anchorEl} open={open} onClose={handleMenuClose} PaperProps={{ sx: { bgcolor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', mt: 1 } }}>
              <MenuItem onClick={() => { handleMenuClose(); router.push('/channels'); }} sx={{ '&:hover': { bgcolor: '#334155' } }}>🌐 사이트별 보기</MenuItem>
              <MenuItem onClick={() => { handleMenuClose(); router.push('/calendar'); }} sx={{ '&:hover': { bgcolor: '#334155' } }}>📅 날짜별 보기</MenuItem>
            </Menu>
            <Button startIcon={<FormatListBulletedIcon />} onClick={() => router.push('/status')} sx={{ color: '#cbd5e1', fontWeight: 600, '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.05)' } }}>
              문의 현황
            </Button>
          </Stack>
        </Container>
      </Box>

      {/* 2. 메인 대시보드 영역 */}
      <Container maxWidth="lg" sx={{ mt: 6, mb: 8, flex: 1 }}>
        <Fade in={true} timeout={800}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 4, display: 'flex', alignItems: 'center', gap: 1 }}>📊 오늘의 현황</Typography>
            
            {/* DB 값으로 렌더링되는 카드들 */}
            <Grid container spacing={3}>
              {SUMMARY_DATA.map((item, index) => (
                <Grid item xs={12} sm={6} md={3} key={index}>
                  <Card elevation={0} sx={{ bgcolor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', backdropFilter: 'blur(10px)', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-4px)', boxShadow: `0 8px 24px ${item.bg}`, borderColor: 'rgba(255, 255, 255, 0.2)' } }}>
                    <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Typography variant="subtitle2" sx={{ color: '#94a3b8', fontWeight: 600 }}>{item.title}</Typography>
                        <Box sx={{ color: item.color, p: 1, bgcolor: item.bg, borderRadius: '12px', display: 'flex' }}>{item.icon}</Box>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography variant="h3" sx={{ fontWeight: 800, color: '#f8fafc' }}>{item.count}</Typography>
                        <Typography variant="subtitle1" sx={{ color: '#64748b', fontWeight: 500 }}>건</Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>

            {/* 3. 빠른 작업 시작 */}
            <Box sx={{ mt: 8, p: 4, bgcolor: 'rgba(15, 23, 42, 0.4)', borderRadius: '24px', border: '1px dashed rgba(255,255,255,0.1)' }}>
              <Typography variant="subtitle1" sx={{ color: '#cbd5e1', mb: 3, fontWeight: 600, textAlign: 'center' }}>🚀 빠른 작업 시작</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} justifyContent="center">
                <Button variant="contained" startIcon={<CloudDownloadIcon />} onClick={() => router.push('/status')} sx={{ bgcolor: '#3b82f6', color: '#fff', px: 4, py: 1.5, borderRadius: '12px', fontSize: '1.1rem', fontWeight: 700, textTransform: 'none', '&:hover': { bgcolor: '#2563eb' } }}>
                  새로운 문의 수집
                </Button>
                <Button variant="outlined" startIcon={<AutoAwesomeIcon />} sx={{ borderColor: '#8b5cf6', color: '#c4b5fd', px: 4, py: 1.5, borderRadius: '12px', fontSize: '1.1rem', fontWeight: 700, textTransform: 'none', borderWidth: '2px', '&:hover': { borderWidth: '2px', borderColor: '#a78bfa', bgcolor: 'rgba(139, 92, 246, 0.1)', color: '#ddd6fe' } }}>
                  AI 초안 작성하기
                </Button>
              </Stack>
            </Box>
          </Box>
        </Fade>
      </Container>
    </Box>
  );
}