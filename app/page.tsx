'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

import { Box, Container, Typography, Button, Fade, Card, CardContent, Stack, Menu, MenuItem, CircularProgress } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import InboxIcon from '@mui/icons-material/Inbox';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RateReviewIcon from '@mui/icons-material/RateReview';
import FilterAltIcon from '@mui/icons-material/FilterAlt'; // 미답변 전용 아이콘

export default function DashboardHome() {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  
  // 상태 분리 (전체 수집용 / 미답변 수집용)
  const [isCollectingAll, setIsCollectingAll] = useState(false);
  const [isCollectingUnanswered, setIsCollectingUnanswered] = useState(false);
  
  const [counts, setCounts] = useState({ total: 0, pending: 0, completed: 0, reviewing: 0 });

  const fetchCounts = async () => {
    const { count: total } = await supabase.from('inquiries').select('*', { count: 'exact', head: true });
    const { count: pending } = await supabase.from('inquiries').select('*', { count: 'exact', head: true }).eq('status', '대기');
    const { count: completed } = await supabase.from('inquiries').select('*', { count: 'exact', head: true }).eq('status', '등록완료');
    const { count: reviewing } = await supabase.from('inquiries').select('*', { count: 'exact', head: true }).eq('status', '검토중');
    setCounts({ total: total || 0, pending: pending || 0, completed: completed || 0, reviewing: reviewing || 0 });
  };

  useEffect(() => { fetchCounts(); }, []);

  // 1. 기존: 전체 수집
  const handleCollectAll = async () => {
    if (isCollectingAll) return;
    setIsCollectingAll(true);
    try {
      const response = await fetch("/api/collect", { method: "POST" });
      const data = await response.json();
      if (response.ok) {
        alert(`🚀 [전체 수집] ${data.message || '완료!'}`);
        fetchCounts(); 
      } else {
        alert(`❌ 서버 오류: ${data.message}`);
      }
    } catch (error) {
      alert("❌ 서버 연결 실패");
    } finally {
      setIsCollectingAll(false);
    }
  };

  // 2. 신규: 미답변만 수집
  const handleCollectUnanswered = async () => {
    if (isCollectingUnanswered) return;
    setIsCollectingUnanswered(true);
    try {
      const response = await fetch("/api/collect-unanswered", { method: "POST" });
      const data = await response.json();
      if (response.ok) {
        alert(`🎯 [미답변 수집] ${data.message || '완료!'}`);
        fetchCounts(); 
      } else {
        alert(`❌ 서버 오류: ${data.message}`);
      }
    } catch (error) {
      alert("❌ 서버 연결 실패");
    } finally {
      setIsCollectingUnanswered(false);
    }
  };

  const SUMMARY_DATA = [
    { title: '전체 문의', count: counts.total, icon: <InboxIcon fontSize="large" />, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
    { title: '대기중', count: counts.pending, icon: <HourglassEmptyIcon fontSize="large" />, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
    { title: '처리완료', count: counts.completed, icon: <CheckCircleOutlineIcon fontSize="large" />, color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
    { title: '검토중', count: counts.reviewing, icon: <RateReviewIcon fontSize="large" />, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' },
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'transparent', color: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      <Box component="header" sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', bgcolor: 'rgba(15, 23, 42, 0.6)', position: 'sticky', top: 0, zIndex: 50 }}>
        {/* 헤더 생략 (기존과 동일) */}
        <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-1px' }}>
              <span style={{ color: '#3b82f6' }}>N</span>uldam <span style={{ color: '#94a3b8', fontWeight: 300 }}>CX</span>
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b', ml: 1, letterSpacing: '1px' }}>DASHBOARD</Typography>
          </Box>
          <Stack direction="row" spacing={2}>
            <Button onClick={(e) => setAnchorEl(e.currentTarget)} endIcon={<KeyboardArrowDownIcon />} sx={{ color: '#cbd5e1', fontWeight: 600 }}>전체보기</Button>
            <Menu anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)} PaperProps={{ sx: { bgcolor: '#1e293b', color: '#f8fafc' } }}>
              <MenuItem onClick={() => router.push('/channels')}>🌐 사이트별 보기</MenuItem>
              <MenuItem onClick={() => router.push('/calendar')}>📅 날짜별 보기</MenuItem>
            </Menu>
            <Button startIcon={<FormatListBulletedIcon />} onClick={() => router.push('/status')} sx={{ color: '#cbd5e1', fontWeight: 600 }}>문의 현황</Button>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ mt: 6, mb: 8, flex: 1 }}>
        <Fade in timeout={800}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 4 }}>📊 오늘의 현황</Typography>
            
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, '& > *': { flex: { xs: '1 1 100%', sm: '1 1 calc(50% - 12px)', md: '1 1 calc(25% - 18px)' } } }}>
              {SUMMARY_DATA.map((item, index) => (
                <Card key={index} elevation={0} sx={{ bgcolor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', backdropFilter: 'blur(10px)', '&:hover': { transform: 'translateY(-4px)', borderColor: 'rgba(255, 255, 255, 0.2)', transition: '0.2s' } }}>
                  <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="subtitle2" sx={{ color: '#94a3b8', fontWeight: 600 }}>{item.title}</Typography>
                      <Box sx={{ color: item.color, p: 1, bgcolor: item.bg, borderRadius: '12px', display: 'flex' }}>{item.icon}</Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                      <Typography variant="h3" sx={{ color: '#ffffffff', fontWeight: 800 }}>{item.count}</Typography>
                      <Typography variant="subtitle1" sx={{ color: '#64748b' }}>건</Typography>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>

            {/* Quick Action Section */}
            <Box sx={{ mt: 8, p: 6, bgcolor: 'rgba(15, 23, 42, 0.4)', borderRadius: '24px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center' }}>
              <Typography variant="subtitle1" sx={{ color: '#cbd5e1', mb: 4, fontWeight: 600 }}>🚀 빠른 작업 시작</Typography>
              
              {/* 버튼을 3개로 구성했습니다! */}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
                <Button 
                  variant="outlined" 
                  startIcon={isCollectingAll ? <CircularProgress size={20} color="inherit" /> : <CloudDownloadIcon />}
                  onClick={handleCollectAll}
                  disabled={isCollectingAll || isCollectingUnanswered}
                  sx={{ borderColor: '#64748b', color: '#cbd5e1', px: 4, py: 1.5, borderRadius: '12px', fontWeight: 600 }}
                >
                  {isCollectingAll ? '수집 중...' : '최근 전체 수집'}
                </Button>

                <Button 
                  variant="contained" 
                  startIcon={isCollectingUnanswered ? <CircularProgress size={20} color="inherit" /> : <FilterAltIcon />}
                  onClick={handleCollectUnanswered}
                  disabled={isCollectingAll || isCollectingUnanswered}
                  sx={{ bgcolor: '#f59e0b', color: '#fff', px: 5, py: 1.5, borderRadius: '12px', fontWeight: 700, '&:hover': { bgcolor: '#d97706' } }}
                >
                  {isCollectingUnanswered ? '수집 중...' : '미답변만 수집'}
                </Button>

                <Button 
                  variant="outlined" 
                  startIcon={<AutoAwesomeIcon />}
                  sx={{ borderColor: '#8b5cf6', color: '#c4b5fd', px: 4, py: 1.5, borderRadius: '12px', fontWeight: 600 }}
                >
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