'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// 💡 분리해둔 상수와 정규화 함수
import { DISPLAY_CHANNELS } from '@/lib/constants';
import { normalizeSiteName } from '@/lib/siteMapper';

// MUI Core
import {
  Box, Container, Typography, IconButton, TextField, Stack,
  Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Chip, Fade, ToggleButton, ToggleButtonGroup, CircularProgress, Button
} from '@mui/material';

// MUI Icons
import {
  ArrowBack as ArrowBackIcon,
  PhoneInTalk as PhoneIcon,
  HeadsetMic as HeadsetIcon,
  BarChart as BarChartIcon,
  ListAlt as ListAltIcon
} from '@mui/icons-material';

// ==========================================
// 🌟 1. 타입 정의 (수기/자동 분리)
// ==========================================
interface StatData {
  name: string;
  autoCount: number;   
  manualCount: number; 
  issue: string;
}

interface TrendData {
  id: string;   
  label: string; 
  count: number;
}

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
  const router = useRouter(); 
  
  const todayDate = getLocalYYYYMMDD(new Date());
  const thisMonth = todayDate.substring(0, 7);

  const [viewMode, setViewMode] = useState<'daily' | 'monthly' | 'range' | 'picker'>('daily');
  const [targetDate, setTargetDate] = useState(todayDate);
  const [targetMonth, setTargetMonth] = useState(thisMonth);

  // 📅 커스텀 날짜 모드 상태
  const [rangeStart, setRangeStart] = useState(todayDate);
  const [rangeEnd, setRangeEnd] = useState(todayDate);
  const [pickerDates, setPickerDates] = useState<string[]>([todayDate]);
  const [pickerInput, setPickerInput] = useState(todayDate);
  
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  
  const [currentStats, setCurrentStats] = useState<StatData[]>(
    DISPLAY_CHANNELS.map(name => ({ name, autoCount: 0, manualCount: 0, issue: '' }))
  );
  
  const [callStats, setCallStats] = useState({ inflow: 0, response: 0 });
  const [loading, setLoading] = useState(true);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // 💡 [추가] 시트 내보내기 로딩 상태
  const [isExporting, setIsExporting] = useState(false);

  // ==========================================
  // 📡 3. 데이터 페칭 (트렌드 차트 - 총합 반영 + 월별 버그 픽스)
  // ==========================================
  useEffect(() => {
    const fetchTrendData = async () => {
      // range/picker 모드에서는 트렌드 차트를 표시하지 않음
      if (viewMode === 'range' || viewMode === 'picker') {
        setTrendData([]);
        return;
      }

      const today = new Date();
      let startStr = '';
      let endStr = `${getLocalYYYYMMDD(today)} 23:59:59`;

      if (viewMode === 'daily') {
        const past14Days = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13);
        startStr = `${getLocalYYYYMMDD(past14Days)} 00:00:00`;
      } else {
        const past6Months = new Date(today.getFullYear(), today.getMonth() - 5, 1);
        startStr = `${getLocalYYYYMMDD(past6Months)} 00:00:00`;
      }

      // 1. 자동 수집 건수 가져오기
      const { data: autoData, error: autoError } = await supabase
        .from('inquiries')
        .select('inquiry_date')
        .gte('inquiry_date', startStr)
        .lte('inquiry_date', endStr);

      // 2. 수기 저장 건수 가져오기
      const { data: manualData, error: manualError } = await supabase
        .from('daily_stats')
        .select('date, stats')
        .gte('date', startStr.split(' ')[0])
        .lte('date', endStr.split(' ')[0]);

      // 3. 날짜별 자동 건수 합산
      const countMap: Record<string, number> = {};
      if (!autoError && autoData) {
        autoData.forEach(item => {
          const dateOnly = item.inquiry_date.split(' ')[0].split('T')[0]; 
          const key = viewMode === 'daily' ? dateOnly : dateOnly.substring(0, 7);
          countMap[key] = (countMap[key] || 0) + 1;
        });
      }

      // 4. 날짜별 수기 건수 합산
      const manualCountMap: Record<string, number> = {};
      if (!manualError && manualData) {
        manualData.forEach(item => {
          const dateOnly = item.date;
          const key = viewMode === 'daily' ? dateOnly : dateOnly.substring(0, 7);
          
          let dayManualTotal = 0;
          if (item.stats && Array.isArray(item.stats)) {
            dayManualTotal = item.stats.reduce((acc: number, stat: any) => acc + (stat.manualCount || 0), 0);
          }
          manualCountMap[key] = (manualCountMap[key] || 0) + dayManualTotal;
        });
      }

      // 5. 자동 + 수기 합산하여 트렌드 데이터 생성
      const newTrend: TrendData[] = [];
      if (viewMode === 'daily') {
        for (let i = 13; i >= 0; i--) {
          const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
          const dStr = getLocalYYYYMMDD(d);
          const total = (countMap[dStr] || 0) + (manualCountMap[dStr] || 0); 
          newTrend.push({ id: dStr, label: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, count: total });
        }
      } else {
        for (let i = 5; i >= 0; i--) {
          const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
          const mStr = getLocalYYYYMMDD(d).substring(0, 7);
          const total = (countMap[mStr] || 0) + (manualCountMap[mStr] || 0); 
          newTrend.push({ id: mStr, label: `${d.getMonth() + 1}월`, count: total });
        }
      }
      setTrendData(newTrend);
    };
    fetchTrendData();
  }, [viewMode]);

  // ==========================================
  // 🔒 보안 검증 (화면 차단 트릭)
  // ==========================================
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const allowedEmails = ['cx@joinandjoin.com', 'ilove2622@nuldam.com'];
      if (!session || !allowedEmails.includes(session.user.email || '')) {
        router.replace('/login');
      } else {
        setIsCheckingAuth(false);
      }
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const allowedEmails = ['cx@joinandjoin.com', 'ilove2622@nuldam.com'];
      if (event === 'SIGNED_OUT' || !session || !allowedEmails.includes(session?.user?.email || '')) {
        router.replace('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  // ==========================================
  // 📡 4. 상세 데이터 및 [수기/자동] 병합 페칭
  // ==========================================
  const fetchDetails = useCallback(async () => {
    setLoading(true);
    let startStr = '';
    let endStr = '';
    let pickerDateSet: Set<string> | null = null; // picker 모드: 선택된 날짜만 필터

    if (viewMode === 'daily') {
      startStr = `${targetDate} 00:00:00`;
      endStr = `${targetDate} 23:59:59`;
    } else if (viewMode === 'monthly') {
      const [yyyy, mm] = targetMonth.split('-');
      const lastDay = new Date(Number(yyyy), Number(mm), 0).getDate();
      startStr = `${targetMonth}-01 00:00:00`;
      endStr = `${targetMonth}-${lastDay} 23:59:59`;
    } else if (viewMode === 'range') {
      // 날짜 범위
      const [sd, ed] = rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart];
      startStr = `${sd} 00:00:00`;
      endStr = `${ed} 23:59:59`;
    } else {
      // picker: 선택된 날짜들. 쿼리는 최소~최대 범위로 가져오고, 이후 Set으로 필터링
      if (pickerDates.length === 0) {
        setCurrentStats(DISPLAY_CHANNELS.map(name => ({ name, autoCount: 0, manualCount: 0, issue: '' })));
        setCallStats({ inflow: 0, response: 0 });
        setLoading(false);
        return;
      }
      const sorted = [...pickerDates].sort();
      startStr = `${sorted[0]} 00:00:00`;
      endStr = `${sorted[sorted.length - 1]} 23:59:59`;
      pickerDateSet = new Set(pickerDates);
    }

    // 1. 자동 수집 건수 (범위 내 전체)
    const { data, error } = await supabase.from('inquiries').select('channel, inquiry_date').gte('inquiry_date', startStr).lte('inquiry_date', endStr);
    const autoCounts: Record<string, number> = {};
    if (!error && data) {
      data.forEach(row => {
        // picker 모드: 선택된 날짜만 집계
        if (pickerDateSet) {
          const dateOnly = (row.inquiry_date || '').split(' ')[0].split('T')[0];
          if (!pickerDateSet.has(dateOnly)) return;
        }
        const ch = normalizeSiteName(row.channel);
        autoCounts[ch] = (autoCounts[ch] || 0) + 1;
      });
    }

    // 2. 수기 데이터 합산 (💡 여기서 월별 누락 버그 해결)
    let savedManualData = null;
    let monthlyManualCounts: Record<string, number> = {};
    let monthlyCallInflow = 0;
    let monthlyCallResponse = 0;

    if (viewMode === 'daily') {
      // 일별: 하루치 수기 데이터만
      const { data: manualData } = await supabase.from('daily_stats').select('*').eq('date', targetDate).maybeSingle();
      savedManualData = manualData;
    } else {
      // 월별/범위/선택: 수기 데이터를 범위로 가져와서 합산
      const startStrOnlyDate = startStr.split(' ')[0];
      const endStrOnlyDate = endStr.split(' ')[0];

      const { data: rangeData } = await supabase
        .from('daily_stats')
        .select('*')
        .gte('date', startStrOnlyDate)
        .lte('date', endStrOnlyDate);

      if (rangeData) {
        rangeData.forEach(row => {
          // picker 모드: 선택된 날짜만 합산
          if (pickerDateSet && !pickerDateSet.has(row.date)) return;

          monthlyCallInflow += (row.inflow || 0);
          monthlyCallResponse += (row.response || 0);

          if (row.stats && Array.isArray(row.stats)) {
            row.stats.forEach((s: any) => {
              if (s.name) {
                monthlyManualCounts[s.name] = (monthlyManualCounts[s.name] || 0) + (s.manualCount || 0);
              }
            });
          }
        });
      }
    }

    // 3. 뷰어에 뿌려줄 데이터 병합
    setCurrentStats(DISPLAY_CHANNELS.map(name => {
      const finalAutoCount = autoCounts[name] || 0;
      let finalManualCount = 0;
      let finalIssue = '';

      if (viewMode === 'daily') {
        if (savedManualData?.stats) {
          const saved = savedManualData.stats.find((s: any) => s.name === name);
          if (saved) {
            finalManualCount = saved.manualCount || 0;
            finalIssue = saved.issue || '';
          }
        }
      } else {
        // 월별/범위/선택 모드일 땐 합산된 수기 데이터 반영
        finalManualCount = monthlyManualCounts[name] || 0;
      }

      return { name, autoCount: finalAutoCount, manualCount: finalManualCount, issue: finalIssue };
    }));

    // 4. 총 유입호/응대콜 반영 (월별/범위/선택 통계 포함)
    if (viewMode === 'daily' && savedManualData) {
      setCallStats({ inflow: savedManualData.inflow || 0, response: savedManualData.response || 0 });
    } else if (viewMode === 'daily') {
      setCallStats({ inflow: 0, response: 0 });
    } else {
      setCallStats({ inflow: monthlyCallInflow, response: monthlyCallResponse });
    }

    setLoading(false);
  }, [viewMode, targetDate, targetMonth, rangeStart, rangeEnd, pickerDates]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  // ==========================================
  // ⚙️ 5. 핸들러 (수기 입력 & DB 저장 & 시트 내보내기)
  // ==========================================
  const handleStatChange = (index: number, field: 'manualCount' | 'issue', value: string) => {
    const newStats = [...currentStats];
    if (field === 'manualCount') {
      newStats[index].manualCount = value === '' ? 0 : Number(value);
    } else {
      newStats[index].issue = value;
    }
    setCurrentStats(newStats);
  };

  const handleViewModeChange = (event: React.MouseEvent<HTMLElement>, newView: 'daily' | 'monthly' | 'range' | 'picker') => {
    if (newView !== null) setViewMode(newView);
  };

  // 📅 선택된 날짜 리스트 조작
  const addPickerDate = () => {
    if (pickerInput && !pickerDates.includes(pickerInput)) {
      setPickerDates([...pickerDates, pickerInput].sort());
    }
  };
  const removePickerDate = (d: string) => {
    setPickerDates(pickerDates.filter(x => x !== d));
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault(); 
      if (viewMode !== 'daily') return; // 일별 모드에서만 저장

      try {
        const { error } = await supabase.from('daily_stats').upsert({
          date: targetDate,
          inflow: callStats.inflow,
          response: callStats.response,
          stats: currentStats 
        });

        if (error) throw error;
        alert('✅ 수기 데이터가 안전하게 저장되었습니다!\n(새로고침을 하거나 날짜를 다시 누르면 그래프에 반영됩니다.)');
      } catch (error) {
        console.error('저장 에러:', error);
        alert('❌ 저장에 실패했습니다.');
      }
    }
  };

  // 💡 [추가] 구글 시트로 내보내는 핸들러
  const handleExportToSheet = async () => {
    if (!window.confirm(`[${targetDate}] 데이터를 구글 시트에 업데이트하시겠습니까?`)) return;
    
    setIsExporting(true);
    try {
      // 각 채널의 자동+수기 총합 숫자 배열 추출
const totalsArray = currentStats.map((stat: any) => stat.autoCount + stat.manualCount);
      const payload = {
        date: targetDate, 
        inflow: callStats.inflow,
        response: callStats.response,
        totals: totalsArray
      };

      const res = await fetch('/api/export-to-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert('✅ 구글 시트에 성공적으로 기재되었습니다!');
      } else {
        alert(`❌ 전송 실패: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('❌ 서버와 통신하는 중 네트워크 오류가 발생했습니다.');
    } finally {
      setIsExporting(false);
    }
  };

  const totalCount = currentStats.reduce((acc, cur) => acc + cur.autoCount + cur.manualCount, 0);
  const maxTrendCount = Math.max(...trendData.map(d => d.count), 1);
  
  const sortedChannels = useMemo(() => {
    return [...currentStats]
      .filter(s => (s.autoCount + s.manualCount) > 0)
      .sort((a, b) => (b.autoCount + b.manualCount) - (a.autoCount + a.manualCount));
  }, [currentStats]);
  
  const maxChannelCount = sortedChannels.length > 0 ? (sortedChannels[0].autoCount + sortedChannels[0].manualCount) : 1;

  // ==========================================
  // 🎨 6. 렌더링
  // ==========================================
  if (isCheckingAuth) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress sx={{ color: '#3b82f6' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', color: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      
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
            
            {/* 💡 상단 우측 컨트롤 바 */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Button 
                size="small" 
                variant="contained" 
                startIcon={isExporting ? <CircularProgress size={14} color="inherit" /> : <ListAltIcon fontSize="small" />} 
                onClick={handleExportToSheet} 
                disabled={isExporting || viewMode !== 'daily'} 
                sx={{ 
                  bgcolor: '#10b981', color: '#fff', fontWeight: 600, 
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                  '&:hover': { bgcolor: '#059669' },
                  '&.Mui-disabled': { bgcolor: 'rgba(16, 185, 129, 0.3)', color: '#a7f3d0' }
                }}
              >
                시트에 내보내기
              </Button>

              <ToggleButtonGroup
                value={viewMode} exclusive onChange={handleViewModeChange} size="small"
                sx={{
                  bgcolor: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.05)',
                  '& .MuiToggleButton-root': {
                    color: '#64748b', border: 'none', px: 2, py: 0.5, fontSize: '0.8rem', fontWeight: 600,
                    '&.Mui-selected': { color: '#fff', bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' } }
                  }
                }}
              >
                <ToggleButton value="daily">일별</ToggleButton>
                <ToggleButton value="monthly">월별</ToggleButton>
                <ToggleButton value="range">기간</ToggleButton>
                <ToggleButton value="picker">선택</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ mt: 3, mb: 8, flex: 1 }}>
        <Fade in={true} timeout={500}>
          <Box>
            
            {/* 📅 기간 선택 (range 모드) */}
            {viewMode === 'range' && (
              <Card elevation={0} sx={{ bgcolor: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '12px', mb: 3 }}>
                <CardContent sx={{ p: '20px !important', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#f8fafc' }}>📅 기간 선택</Typography>
                  <TextField
                    type="date" size="small" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)}
                    sx={{ '& .MuiInputBase-root': { bgcolor: 'rgba(15,23,42,0.5)', color: '#f8fafc', borderRadius: '8px', fontSize: '0.85rem' }, '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' } }}
                    InputLabelProps={{ shrink: true }}
                  />
                  <Typography sx={{ color: '#64748b' }}>~</Typography>
                  <TextField
                    type="date" size="small" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)}
                    sx={{ '& .MuiInputBase-root': { bgcolor: 'rgba(15,23,42,0.5)', color: '#f8fafc', borderRadius: '8px', fontSize: '0.85rem' }, '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' } }}
                    InputLabelProps={{ shrink: true }}
                  />
                  <Chip
                    label={`${rangeStart} ~ ${rangeEnd}`}
                    size="small"
                    sx={{ bgcolor: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontWeight: 700 }}
                  />
                </CardContent>
              </Card>
            )}

            {/* 📅 개별 날짜 선택 (picker 모드) */}
            {viewMode === 'picker' && (
              <Card elevation={0} sx={{ bgcolor: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '12px', mb: 3 }}>
                <CardContent sx={{ p: '20px !important' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#f8fafc' }}>📅 개별 날짜 선택</Typography>
                    <TextField
                      type="date" size="small" value={pickerInput} onChange={(e) => setPickerInput(e.target.value)}
                      sx={{ '& .MuiInputBase-root': { bgcolor: 'rgba(15,23,42,0.5)', color: '#f8fafc', borderRadius: '8px', fontSize: '0.85rem' }, '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' } }}
                      InputLabelProps={{ shrink: true }}
                    />
                    <Button
                      size="small" variant="contained" onClick={addPickerDate}
                      sx={{ bgcolor: '#3b82f6', color: '#fff', fontWeight: 700, '&:hover': { bgcolor: '#2563eb' } }}
                    >
                      추가
                    </Button>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                      선택된 {pickerDates.length}일의 데이터가 합산됩니다.
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {pickerDates.length === 0 ? (
                      <Typography variant="caption" sx={{ color: '#64748b' }}>날짜를 선택해서 추가해주세요.</Typography>
                    ) : (
                      pickerDates.map(d => (
                        <Chip
                          key={d} label={d} size="small"
                          onDelete={() => removePickerDate(d)}
                          sx={{ bgcolor: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontWeight: 700, '& .MuiChip-deleteIcon': { color: '#60a5fa' } }}
                        />
                      ))
                    )}
                  </Box>
                </CardContent>
              </Card>
            )}

            {/* 📈 상단: 트렌드 차트 (일별/월별 전용) */}
            {(viewMode === 'daily' || viewMode === 'monthly') && (
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
                          height: '100%', opacity: isSelected ? 1 : 0.6, transition: '0.2s',
                          '&:hover': { opacity: 1, '& .bar': { bgcolor: isSelected ? '#3b82f6' : 'rgba(59, 130, 246, 0.5)' } }
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: 800, color: isSelected ? '#3b82f6' : '#94a3b8', mb: 0.5, fontSize: '0.75rem' }}>
                          {item.count > 0 ? item.count : ''}
                        </Typography>
                        
                        <Box className="bar" sx={{ 
                          width: '100%', maxWidth: viewMode === 'daily' ? '40px' : '60px', 
                          height: `${heightPercent}%`, bgcolor: isSelected ? '#3b82f6' : 'rgba(255,255,255,0.1)', 
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
            )}

            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>
              
              {/* 👉 좌측 패널: 쇼핑몰별 비중 (통합 합계) */}
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Card elevation={0} sx={{ bgcolor: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '12px', flex: 1, minHeight: '300px' }}>
                  <Box sx={{ p: 2, px: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#f8fafc' }}>
                      {viewMode === 'daily' ? targetDate
                        : viewMode === 'monthly' ? targetMonth
                        : viewMode === 'range' ? `${rangeStart} ~ ${rangeEnd}`
                        : `선택한 ${pickerDates.length}일`} 통합 비중
                    </Typography>
                    <Chip label={`총 합계: ${totalCount}건`} size="small" sx={{ bgcolor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 800 }} />
                  </Box>
                  <CardContent sx={{ p: '20px !important' }}>
                    {sortedChannels.length > 0 ? (
                      <Stack spacing={2}>
                        {sortedChannels.map((stat) => {
                          const itemTotal = stat.autoCount + stat.manualCount;
                          return (
                            <Box key={stat.name} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Typography variant="caption" sx={{ width: '90px', fontWeight: 600, color: '#cbd5e1', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {stat.name}
                              </Typography>
                              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Box sx={{ flex: 1, bgcolor: 'rgba(15, 23, 42, 0.5)', borderRadius: '6px', height: '14px', position: 'relative', overflow: 'hidden' }}>
                                  <Box 
                                    sx={{ 
                                      position: 'absolute', top: 0, left: 0, height: '100%',
                                      bgcolor: '#60a5fa', width: `${(itemTotal / maxChannelCount) * 100}%`,
                                      transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)', borderRadius: '6px'
                                    }} 
                                  />
                                </Box>
                                <Typography variant="caption" sx={{ width: '30px', fontWeight: 700, color: '#60a5fa' }}>{itemTotal}</Typography>
                              </Box>
                            </Box>
                          );
                        })}
                      </Stack>
                    ) : (
                      <Box sx={{ py: 6, textAlign: 'center' }}>
                        <Typography variant="body2" sx={{ color: '#64748b' }}>수집된 문의가 없습니다.</Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Box>

              {/* 👉 우측 패널: 수기 작성 (일별 모드 전용) */}
              {viewMode === 'daily' && (
                <Box sx={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Card elevation={0} sx={{ flex: 1, bgcolor: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '12px' }}>
                      <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: '16px !important' }}>
                        <Box>
                          <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, color: '#94a3b8', display: 'block' }}>📞 총 유입호 (입력 후 엔터)</Typography>
                          <TextField
                            variant="standard" value={callStats.inflow === 0 ? '' : callStats.inflow} placeholder="0" type="number"
                            onChange={(e) => setCallStats({...callStats, inflow: Number(e.target.value)})}
                            onKeyDown={handleKeyDown} 
                            onWheel={(e) => (e.target as HTMLElement).blur()}
                            InputProps={{ disableUnderline: true, style: { fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc' } }}
                            sx={{ 
                              width: '80px',
                              '& input[type=number]::-webkit-inner-spin-button, & input[type=number]::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 },
                              '& input[type=number]': { MozAppearance: 'textfield' }
                            }}
                          />
                        </Box>
                        <Box sx={{ bgcolor: 'rgba(59, 130, 246, 0.15)', p: 1, borderRadius: '8px', color: '#3b82f6' }}><PhoneIcon fontSize="small" /></Box>
                      </CardContent>
                    </Card>
                    
                    <Card elevation={0} sx={{ flex: 1, bgcolor: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '12px' }}>
                      <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: '16px !important' }}>
                        <Box>
                          <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, color: '#94a3b8', display: 'block' }}>🗣️ 총 응대콜 (입력 후 엔터)</Typography>
                          <TextField
                            variant="standard" value={callStats.response === 0 ? '' : callStats.response} placeholder="0" type="number"
                            onChange={(e) => setCallStats({...callStats, response: Number(e.target.value)})}
                            onKeyDown={handleKeyDown} 
                            onWheel={(e) => (e.target as HTMLElement).blur()}
                            InputProps={{ disableUnderline: true, style: { fontSize: '1.5rem', fontWeight: 800, color: '#10b981' } }}
                            sx={{ 
                              width: '80px',
                              '& input[type=number]::-webkit-inner-spin-button, & input[type=number]::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 },
                              '& input[type=number]': { MozAppearance: 'textfield' }
                            }}
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
                        <Typography variant="caption" sx={{ color: '#94a3b8', ml: 1, fontWeight: 400 }}>(입력 후 엔터 저장)</Typography>
                      </Typography>
                    </Box>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell width="18%" sx={{ bgcolor: 'rgba(15,23,42,0.9)', color: '#94a3b8', fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>채널명</TableCell>
                          <TableCell width="12%" align="center" sx={{ bgcolor: 'rgba(15,23,42,0.9)', color: '#94a3b8', fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>자동</TableCell>
                          <TableCell width="16%" align="center" sx={{ bgcolor: 'rgba(15,23,42,0.9)', color: '#3b82f6', fontSize: '0.75rem', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>+ 수기</TableCell>
                          <TableCell width="12%" align="center" sx={{ bgcolor: 'rgba(15,23,42,0.9)', color: '#10b981', fontSize: '0.75rem', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>총합</TableCell>
                          <TableCell width="42%" sx={{ bgcolor: 'rgba(15,23,42,0.9)', color: '#94a3b8', fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>특이사항 기재</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {currentStats.map((stat, index) => {
                          const rowTotal = stat.autoCount + stat.manualCount;
                          
                          return (
                            <TableRow key={stat.name} sx={{ '&:last-child td, &:last-child th': { border: 0 }, '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                              <TableCell sx={{ py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                <Typography variant="caption" sx={{ fontWeight: 600, color: '#e2e8f0' }}>{stat.name}</Typography>
                              </TableCell>
                              
                              <TableCell align="center" sx={{ py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: stat.autoCount > 0 ? '#94a3b8' : 'rgba(148,163,184,0.3)' }}>{stat.autoCount}</Typography>
                              </TableCell>
                              
                              <TableCell align="center" sx={{ py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                <TextField
                                  variant="outlined" size="small" type="number" placeholder="0"
                                  value={stat.manualCount === 0 ? '' : stat.manualCount} 
                                  onChange={(e) => handleStatChange(index, 'manualCount', e.target.value)}
                                  onKeyDown={handleKeyDown} 
                                  onWheel={(e) => (e.target as HTMLElement).blur()}
                                  inputProps={{ style: { textAlign: 'center', fontWeight: 800, fontSize: '0.8rem', color: '#3b82f6', padding: '4px 6px' } }}
                                  sx={{ 
                                    width: '55px', 
                                    '& .MuiOutlinedInput-root': { bgcolor: 'rgba(59, 130, 246, 0.1)', borderRadius: '6px', '& fieldset': { borderColor: 'transparent' }, '&:hover fieldset': { borderColor: '#3b82f6' } },
                                    '& input[type=number]::-webkit-inner-spin-button, & input[type=number]::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 },
                                    '& input[type=number]': { MozAppearance: 'textfield' }
                                  }}
                                />
                              </TableCell>
                              
                              <TableCell align="center" sx={{ py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                <Typography variant="caption" sx={{ fontWeight: 800, color: rowTotal > 0 ? '#10b981' : 'rgba(16,185,129,0.3)', fontSize: '0.8rem' }}>
                                  {rowTotal}
                                </Typography>
                              </TableCell>

                              <TableCell sx={{ py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                <TextField
                                  fullWidth variant="outlined" size="small" placeholder="이슈 입력 후 엔터"
                                  value={stat.issue} onChange={(e) => handleStatChange(index, 'issue', e.target.value)}
                                  onKeyDown={handleKeyDown} 
                                  inputProps={{ style: { fontSize: '0.8rem', padding: '4px 10px' } }}
                                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '6px', bgcolor: 'rgba(15,23,42,0.4)', color: '#cbd5e1', '& fieldset': { borderColor: 'transparent' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.1)' }, '&.Mui-focused fieldset': { borderColor: '#3b82f6' } } }}
                                />
                              </TableCell>
                            </TableRow>
                          )
                        })}
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