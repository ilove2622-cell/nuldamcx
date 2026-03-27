'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

// 💡 분리해둔 상수와 정규화 함수
import { DISPLAY_CHANNELS } from '@/lib/constants';
import { normalizeSiteName } from '@/lib/siteMapper';

// MUI Core
import {
  Box, Container, Typography, IconButton, TextField, Stack,
  Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Chip, Fade, ToggleButton, ToggleButtonGroup
} from '@mui/material';

// MUI Icons
import {
  ArrowBack as ArrowBackIcon,
  PhoneInTalk as PhoneIcon,
  HeadsetMic as HeadsetIcon,
  BarChart as BarChartIcon,
  ListAlt as ListAltIcon,
  PieChart as PieChartIcon
} from '@mui/icons-material';
import router from 'next/router';

// ==========================================
// 🌟 1. 타입 정의
// ==========================================
interface StatData {
  name: string;
  count: number;
  issue: string; // 수기 입력용
}

interface TrendData {
  id: string;   // 일별: YYYY-MM-DD, 월별: YYYY-MM
  label: string; // 일별: MM-DD, 월별: M월
  count: number;
}

// 현지 시간 기준 YYYY-MM-DD 생성 헬퍼
const getLocalYYYYMMDD = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// ==========================================
// 🌟 2. 메인 컴포넌트
// ==========================================
export default function StatusPage() {
  const todayDate = getLocalYYYYMMDD(new Date());
  const thisMonth = todayDate.substring(0, 7);

  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
  const [targetDate, setTargetDate] = useState(todayDate);
  const [targetMonth, setTargetMonth] = useState(thisMonth);
  
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [currentStats, setCurrentStats] = useState<StatData[]>(
    DISPLAY_CHANNELS.map(name => ({ name, count: 0, issue: '' }))
  );
  
  const [callStats, setCallStats] = useState({ inflow: 0, response: 0 });
  const [loading, setLoading] = useState(true);

  // ==========================================
  // 📡 3. 데이터 페칭 (트렌드 차트)
  // ==========================================
  useEffect(() => {
    const fetchTrendData = async () => {
      const today = new Date();
      let startStr = '';
      let endStr = `${getLocalYYYYMMDD(today)} 23:59:59`;

      if (viewMode === 'daily') {
        const past14Days = new Date();
        past14Days.setDate(today.getDate() - 13);
        startStr = `${getLocalYYYYMMDD(past14Days)} 00:00:00`;
      } else {
        const past6Months = new Date();
        past6Months.setMonth(today.getMonth() - 5);
        past6Months.setDate(1);
        startStr = `${getLocalYYYYMMDD(past6Months)} 00:00:00`;
      }

      const { data, error } = await supabase
        .from('inquiries')
        .select('inquiry_date')
        .gte('inquiry_date', startStr)
        .lte('inquiry_date', endStr);

      if (!error && data) {
        const countMap: Record<string, number> = {};
        
        data.forEach(item => {
          const dateOnly = item.inquiry_date.split(' ')[0].split('T')[0]; // YYYY-MM-DD
          const key = viewMode === 'daily' ? dateOnly : dateOnly.substring(0, 7); // YYYY-MM-DD or YYYY-MM
          countMap[key] = (countMap[key] || 0) + 1;
        });

        const newTrend: TrendData[] = [];
        
        if (viewMode === 'daily') {
          for (let i = 13; i >= 0; i--) {
            const d = new Date();
            d.setDate(today.getDate() - i);
            const dStr = getLocalYYYYMMDD(d);
            newTrend.push({
              id: dStr,
              label: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
              count: countMap[dStr] || 0
            });
          }
        } else {
          for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(today.getMonth() - i);
            const mStr = getLocalYYYYMMDD(d).substring(0, 7);
            newTrend.push({
              id: mStr,
              label: `${d.getMonth() + 1}월`,
              count: countMap[mStr] || 0
            });
          }
        }
        setTrendData(newTrend);
      }
    };
    fetchTrendData();
  }, [viewMode]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session.user.email !== 'cx@joinandjoin.com') {
        router.replace('/login');
      }
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session || session.user.email !== 'cx@joinandjoin.com') {
        router.replace('/login');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  // ==========================================
  // 📡 4. 데이터 페칭 (상세 현황)
  // ==========================================
  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      let startStr = '';
      let endStr = '';

      if (viewMode === 'daily') {
        startStr = `${targetDate} 00:00:00`;
        endStr = `${targetDate} 23:59:59`;
      } else {
        const [yyyy, mm] = targetMonth.split('-');
        const lastDay = new Date(Number(yyyy), Number(mm), 0).getDate();
        startStr = `${targetMonth}-01 00:00:00`;
        endStr = `${targetMonth}-${lastDay} 23:59:59`;
      }

      const { data, error } = await supabase
        .from('inquiries')
        .select('channel')
        .gte('inquiry_date', startStr)
        .lte('inquiry_date', endStr);

      if (!error && data) {
        const counts: Record<string, number> = {};
        data.forEach(row => {
          const ch = normalizeSiteName(row.channel);
          counts[ch] = (counts[ch] || 0) + 1;
        });

        setCurrentStats(DISPLAY_CHANNELS.map(name => ({
          name,
          count: counts[name] || 0,
          issue: '' 
        })));
      }
      setLoading(false);
    };
    fetchDetails();
  }, [viewMode, targetDate, targetMonth]);


  // ==========================================
  // ⚙️ 5. 계산 및 핸들러
  // ==========================================
  const handleStatChange = (index: number, field: 'count' | 'issue', value: string) => {
    const newStats = [...currentStats];
    if (field === 'count') newStats[index].count = Number(value) || 0;
    else newStats[index].issue = value;
    setCurrentStats(newStats);
  };

  const handleViewModeChange = (event: React.MouseEvent<HTMLElement>, newView: 'daily' | 'monthly') => {
    if (newView !== null) setViewMode(newView);
  };

  const totalCount = currentStats.reduce((acc, cur) => acc + cur.count, 0);
  const maxTrendCount = Math.max(...trendData.map(d => d.count), 1);
  
  // 비중 차트를 위해 건수가 있는 채널만 내림차순 정렬
  const sortedChannels = useMemo(() => {
    return [...currentStats].filter(s => s.count > 0).sort((a, b) => b.count - a.count);
  }, [currentStats]);
  const maxChannelCount = sortedChannels.length > 0 ? sortedChannels[0].count : 1;

  // ==========================================
  // 🎨 6. 렌더링
  // ==========================================
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', color: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      
      {/* 🌟 헤더 영역 */}
      <Box component="header" sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', bgcolor: 'rgba(15, 23, 42, 0.8)', position: 'sticky', top: 0, zIndex: 50 }}>
        <Container maxWidth="lg" sx={{ py: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Link href="/" passHref style={{ textDecoration: 'none' }}>
                <IconButton edge="start" size="small" sx={{ color: '#cbd5e1', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' } }}>
                  <ArrowBackIcon fontSize="small" />
                </IconButton>
              </Link>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.5px' }}>
                📊 문의 수량 추이 및 현황 입력
              </Typography>
            </Box>
            
            {/* 일별/월별 토글 버튼 */}
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={handleViewModeChange}
              size="small"
              sx={{ 
                bgcolor: 'rgba(15, 23, 42, 0.6)', 
                border: '1px solid rgba(255,255,255,0.05)',
                '& .MuiToggleButton-root': { 
                  color: '#64748b', border: 'none', px: 2, py: 0.5, fontSize: '0.8rem', fontWeight: 600,
                  '&.Mui-selected': { color: '#fff', bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' } }
                }
              }}
            >
              <ToggleButton value="daily">일별</ToggleButton>
              <ToggleButton value="monthly">월별</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ mt: 3, mb: 8, flex: 1 }}>
        <Fade in={true} timeout={500}>
          <Box>
            
            {/* ======================================= */}
            {/* 1. 상단: 트렌드 차트 (날짜/월 선택기 역할) */}
            {/* ======================================= */}
            <Card elevation={0} sx={{ bgcolor: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '12px', mb: 3 }}>
              <Box sx={{ p: 2, px: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <BarChartIcon fontSize="small" sx={{ color: '#3b82f6' }} /> 
                  {viewMode === 'daily' ? '최근 14일 문의 유입 트렌드' : '최근 6개월 문의 유입 트렌드'}
                </Typography>
                <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                  막대를 클릭하면 해당 일/월의 상세 현황을 확인{viewMode === 'daily' && ' 및 수정'}할 수 있습니다.
                </Typography>
              </Box>
              
              <CardContent sx={{ p: '24px 16px 16px 16px !important', overflowX: 'auto' }}>
                <Box sx={{ display: 'flex', gap: 2, height: '160px', alignItems: 'flex-end', minWidth: viewMode === 'daily' ? '600px' : '400px' }}>
                  {trendData.map((item) => {
                    const isSelected = viewMode === 'daily' ? item.id === targetDate : item.id === targetMonth;
                    const heightPercent = item.count > 0 ? Math.max((item.count / maxTrendCount) * 100, 5) : 0; 
                    
                    return (
                      <Box 
                        key={item.id} 
                        onClick={() => viewMode === 'daily' ? setTargetDate(item.id) : setTargetMonth(item.id)}
                        sx={{ 
                          flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', cursor: 'pointer',
                          height: '100%', // 💡 [핵심 버그 수정] 부모 요소에 높이 100% 부여!
                          opacity: isSelected ? 1 : 0.6, transition: '0.2s',
                          '&:hover': { opacity: 1, '& .bar': { bgcolor: isSelected ? '#3b82f6' : 'rgba(59, 130, 246, 0.5)' } }
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: 800, color: isSelected ? '#3b82f6' : '#94a3b8', mb: 0.5, fontSize: '0.75rem' }}>
                          {item.count > 0 ? item.count : ''}
                        </Typography>
                        
                        <Box className="bar" sx={{ 
                          width: '100%', maxWidth: viewMode === 'daily' ? '40px' : '60px', 
                          height: `${heightPercent}%`, 
                          bgcolor: isSelected ? '#3b82f6' : 'rgba(255,255,255,0.1)', 
                          borderRadius: '4px 4px 0 0', transition: 'height 0.5s ease, background-color 0.2s'
                        }} />
                        
                        <Typography variant="caption" sx={{ mt: 1, fontWeight: 600, color: isSelected ? '#f8fafc' : '#64748b', fontSize: '0.7rem' }}>
                          {item.label}
                        </Typography>
                        
                        <Box sx={{ width: '20px', height: '2px', bgcolor: isSelected ? '#3b82f6' : 'transparent', mt: 0.5, borderRadius: '2px' }} />
                      </Box>
                    );
                  })}
                </Box>
              </CardContent>
            </Card>

            {/* ======================================= */}
            {/* 2. 하단: 좌측(통계 비중) / 우측(수기 작성 폼 - 일별 전용) */}
            {/* ======================================= */}
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>
              
              {/* 👉 좌측 패널: 쇼핑몰별 비중 (항상 표시) */}
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Card elevation={0} sx={{ bgcolor: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '12px', flex: 1, minHeight: '300px' }}>
                  <Box sx={{ p: 2, px: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#f8fafc' }}>
                      {viewMode === 'daily' ? targetDate : targetMonth} 쇼핑몰 비중
                    </Typography>
                    <Chip label={`DB 합계: ${totalCount}건`} size="small" sx={{ bgcolor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 800 }} />
                  </Box>
                  <CardContent sx={{ p: '20px !important' }}>
                    {sortedChannels.length > 0 ? (
                      <Stack spacing={2}>
                        {sortedChannels.map((stat) => (
                          <Box key={stat.name} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Typography variant="caption" sx={{ width: '90px', fontWeight: 600, color: '#cbd5e1', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {stat.name}
                            </Typography>
                            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <Box sx={{ flex: 1, bgcolor: 'rgba(15, 23, 42, 0.5)', borderRadius: '6px', height: '14px', position: 'relative', overflow: 'hidden' }}>
                                <Box 
                                  sx={{ 
                                    position: 'absolute', top: 0, left: 0, height: '100%',
                                    bgcolor: '#60a5fa', width: `${(stat.count / maxChannelCount) * 100}%`,
                                    transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)', borderRadius: '6px'
                                  }} 
                                />
                              </Box>
                              <Typography variant="caption" sx={{ width: '30px', fontWeight: 700, color: '#60a5fa' }}>
                                {stat.count}
                              </Typography>
                            </Box>
                          </Box>
                        ))}
                      </Stack>
                    ) : (
                      <Box sx={{ py: 6, textAlign: 'center' }}>
                        <Typography variant="body2" sx={{ color: '#64748b' }}>수집된 문의가 없습니다.</Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Box>

              {/* 👉 우측 패널: 수기 작성 (일별 모드에서만 표시) */}
              {viewMode === 'daily' && (
                <Box sx={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Card elevation={0} sx={{ flex: 1, bgcolor: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '12px' }}>
                      <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: '16px !important' }}>
                        <Box>
                          <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, color: '#94a3b8', display: 'block' }}>📞 총 유입호 (수기 입력)</Typography>
                          <TextField
                            variant="standard" value={callStats.inflow} type="number"
                            onChange={(e) => setCallStats({...callStats, inflow: Number(e.target.value)})}
                            InputProps={{ disableUnderline: true, style: { fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc' } }}
                            sx={{ width: '80px' }}
                          />
                        </Box>
                        <Box sx={{ bgcolor: 'rgba(59, 130, 246, 0.15)', p: 1, borderRadius: '8px', color: '#3b82f6' }}><PhoneIcon fontSize="small" /></Box>
                      </CardContent>
                    </Card>
                    
                    <Card elevation={0} sx={{ flex: 1, bgcolor: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '12px' }}>
                      <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: '16px !important' }}>
                        <Box>
                          <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, color: '#94a3b8', display: 'block' }}>🗣️ 총 응대콜 (수기 입력)</Typography>
                          <TextField
                            variant="standard" value={callStats.response} type="number"
                            onChange={(e) => setCallStats({...callStats, response: Number(e.target.value)})}
                            InputProps={{ disableUnderline: true, style: { fontSize: '1.5rem', fontWeight: 800, color: '#10b981' } }}
                            sx={{ width: '80px' }}
                          />
                        </Box>
                        <Box sx={{ bgcolor: 'rgba(16, 185, 129, 0.15)', p: 1, borderRadius: '8px', color: '#10b981' }}><HeadsetIcon fontSize="small" /></Box>
                      </CardContent>
                    </Card>
                  </Box>

                  <TableContainer component={Paper} elevation={0} sx={{ bgcolor: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '12px', maxHeight: '500px' }}>
                    <Box sx={{ p: 2, px: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(15, 23, 42, 0.6)', position: 'sticky', top: 0, zIndex: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ListAltIcon fontSize="small" sx={{ color: '#8b5cf6' }} /> 채널별 수기 조정 및 특이사항
                      </Typography>
                    </Box>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell width="25%" sx={{ bgcolor: 'rgba(15,23,42,0.9)', color: '#94a3b8', fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>채널명</TableCell>
                          <TableCell width="25%" align="center" sx={{ bgcolor: 'rgba(15,23,42,0.9)', color: '#94a3b8', fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>수기 건수</TableCell>
                          <TableCell width="50%" sx={{ bgcolor: 'rgba(15,23,42,0.9)', color: '#94a3b8', fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>특이사항 기재</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {currentStats.map((stat, index) => (
                          <TableRow key={stat.name} sx={{ '&:last-child td, &:last-child th': { border: 0 }, '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                            <TableCell sx={{ py: 1, borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                              <Typography variant="caption" sx={{ fontWeight: 600, color: '#e2e8f0' }}>{stat.name}</Typography>
                            </TableCell>
                            <TableCell align="center" sx={{ py: 1, borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                              <TextField
                                variant="outlined" size="small" type="number"
                                value={stat.count} onChange={(e) => handleStatChange(index, 'count', e.target.value)}
                                inputProps={{ style: { textAlign: 'center', fontWeight: 700, fontSize: '0.8rem', color: Number(stat.count) > 0 ? '#3b82f6' : '#cbd5e1', padding: '4px 8px' } }}
                                sx={{ width: '70px', '& .MuiOutlinedInput-root': { bgcolor: 'rgba(15,23,42,0.6)', borderRadius: '6px', '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' }, '&:hover fieldset': { borderColor: '#3b82f6' } } }}
                              />
                            </TableCell>
                            <TableCell sx={{ py: 1, borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                              <TextField
                                fullWidth variant="outlined" size="small" placeholder="이슈 입력..."
                                value={stat.issue} onChange={(e) => handleStatChange(index, 'issue', e.target.value)}
                                inputProps={{ style: { fontSize: '0.8rem', padding: '4px 10px' } }}
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '6px', bgcolor: 'rgba(15,23,42,0.4)', color: '#cbd5e1', '& fieldset': { borderColor: 'transparent' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.1)' }, '&.Mui-focused fieldset': { borderColor: '#3b82f6' } } }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>

                </Box>
              )}
            </Box>

          </Box>
        </Fade>
      </Container>
    </Box>
  );
}