'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// 💡 상수 및 정규화 함수 임포트
import { CHANNEL_URL_MAP, STATUS_OPTIONS, MALL_OPTIONS, CHANNEL_MAP } from '@/lib/constants';

// MUI Components
import {
  Box, Container, Typography, IconButton, Button,
  Card, CardContent, TextField, Checkbox, Stack, CircularProgress,
  MenuItem, Select, InputAdornment, Chip, TablePagination, Collapse, Link as MuiLink, Divider
} from '@mui/material';

// Icons
import {
  CloudDownload as CloudDownloadIcon,
  AutoAwesome as AutoAwesomeIcon,
  Send as SendIcon,
  RocketLaunch as RocketLaunchIcon,
  Search as SearchIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  LocalShipping as LocalShippingIcon,
  Person as PersonIcon,
  Phone as PhoneIcon,
  Home as HomeIcon,
  SmartToy as SmartToyIcon
} from '@mui/icons-material';

// ==========================================
// 🌟 1. 상수 및 헬퍼 함수
// ==========================================

const getStandardChannelName = (rawName: string) => CHANNEL_MAP[rawName] || rawName;

// 어드민 접속 URL 가져오기
const getChannelUrl = (channelName: string) => CHANNEL_URL_MAP[channelName] || '#';

// 날짜 및 시간 안전 파싱 (정렬용)
const getSafeTime = (inquiryDate?: string, collectedAt?: string) => {
  const t1 = inquiryDate ? new Date(inquiryDate).getTime() : 0;
  const t2 = collectedAt ? new Date(collectedAt).getTime() : 0;
  return Math.max(t1, t2); // 둘 중 더 늦은(최신) 시간 반환
};

const getDisplayTime = (inquiryDate?: string, collectedAt?: string) => {
  if (inquiryDate && inquiryDate.includes(':')) return inquiryDate;
  let formattedCollectedTime = '';
  if (collectedAt) {
    const rawString = collectedAt.split('+')[0].split('Z')[0].replace('T', ' '); 
    formattedCollectedTime = rawString.substring(0, 16);
  }
  if (inquiryDate && !inquiryDate.includes(':')) {
    if (formattedCollectedTime.includes(' ')) {
      const timePart = formattedCollectedTime.split(' ')[1]; 
      return `${inquiryDate} ${timePart}`; 
    }
    return inquiryDate;
  }
  return formattedCollectedTime || '시간 정보 없음';
};

const getStatusColor = (status: string) => {
  if (status === '대기' || status === '신규') return { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' };
  if (status === '답변저장') return { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' };
  if (status === '전송요청') return { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' };
  if (status === '처리완료') return { color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
  return { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)' };
};

const getSabangnetOrderUrl = (orderNumber?: string) => {
  if (!orderNumber || orderNumber.trim() === '' || orderNumber === '-') return '#';
  const today = new Date();
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(today.getMonth() - 3);

  const formatDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  };

  const startDate = formatDate(threeMonthsAgo);
  const endDate = formatDate(today);

  return `https://sbadmin15.sabangnet.co.kr/#/popup/views/pages/order/order-confirm?searchCondition=order_id&searchKeyword=${orderNumber}&svcAcntId=mw141500&mode=search&prdNmDiv=prod_nm&startDate=${startDate}&endDate=${endDate}&amtDiv=total_cost&menuNo=938`;
};

const formatTrackingNumber = (num?: string) => {
  if (!num) return '';
  const cleaned = num.replace(/\D/g, ''); 
  return cleaned.replace(/(\d{4})(?=\d)/g, '$1-').replace(/-$/, ''); 
};

const getTrackingUrl = (channel: string, trackingNum?: string) => {
  if (!trackingNum) return '#';
  const cleanNum = trackingNum.replace(/\D/g, '');
  const standardChannel = getStandardChannelName(channel);
  
  if (standardChannel === '네이버' || standardChannel === '이베이') {
    return `https://trace.cjlogistics.com/next/tracking.html?wblNo=${cleanNum}`;
  }
  return `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${cleanNum}`;
};

interface DBInquiry {
  id: string;
  sabangnet_num: string;
  channel: string;
  order_number: string;
  customer_name: string;
  content: string;
  inquiry_date: string;
  status: string;
  ai_draft: string | null;
  admin_reply: string | null;
  collected_at?: string; 
  receiver_name?: string;
  receiver_tel?: string;
  shipping_address?: string;
  tracking_number?: string;
  product_name?: string; // 상품명 필드
}

export default function IntegratedDashboardPage() {
  const router = useRouter();
  
  // ==========================================
  // 🧠 2. 상태(State) 관리
  // ==========================================
  const [allData, setAllData] = useState<DBInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ total: 0, pending: 0, completed: 0, reviewing: 0 });

  const [sortOrder, setSortOrder] = useState('desc'); 
  const [filterStatus, setFilterStatus] = useState('전체');
  const [filterMall, setFilterMall] = useState('전체');
  const [filterCategory, setFilterCategory] = useState('전체');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTriggeringBot, setIsTriggeringBot] = useState(false);
  const [isCollectingAll, setIsCollectingAll] = useState(false);
  
  const [isGeneratingAI, setIsGeneratingAI] = useState<Record<string, boolean>>({});
  const [isGeneratingBulkAI, setIsGeneratingBulkAI] = useState(false);

  // ==========================================
  // 📡 3. 데이터 페칭
  // ==========================================
  const fetchDataAndCounts = async () => {
    setLoading(true);
    
    const { count: total } = await supabase.from('inquiries').select('*', { count: 'exact', head: true });
    const { count: pending } = await supabase.from('inquiries').select('*', { count: 'exact', head: true }).in('status', ['신규', '대기']);
    const { count: completed } = await supabase.from('inquiries').select('*', { count: 'exact', head: true }).eq('status', '처리완료');
    const { count: reviewing } = await supabase.from('inquiries').select('*', { count: 'exact', head: true }).eq('status', '답변저장');
    
    setCounts({ total: total || 0, pending: pending || 0, completed: completed || 0, reviewing: reviewing || 0 });

    const { data, error } = await supabase
      .from('inquiries')
      .select('*');

    if (!error && data) {
      setAllData(data);
      const initialReplies: Record<string, string> = {};
      data.forEach(item => {
        initialReplies[item.id] = item.admin_reply || item.ai_draft || '';
      });
      setReplyTexts(initialReplies);
    }
    setLoading(false);
    setSelectedIds([]); 
  };

  useEffect(() => { fetchDataAndCounts(); }, []);

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
  // 🎯 4. 필터링, 정렬, 그룹화
  // ==========================================
  const filteredData = useMemo(() => {
    return allData.filter(item => {
      const standardChannel = getStandardChannelName(item.channel);
      if (filterStatus !== '전체' && item.status !== filterStatus) return false;
      if (filterMall !== '전체') {
        if (filterMall === '기타') {
          const mainMalls = MALL_OPTIONS.slice(1, -1);
          if (mainMalls.includes(standardChannel)) return false; 
        } else if (standardChannel !== filterMall) return false;
      }
      if (startDate && item.inquiry_date < startDate) return false;
      if (endDate && item.inquiry_date > endDate) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const isMatch = 
          (item.customer_name && item.customer_name.toLowerCase().includes(query)) ||
          (item.order_number && item.order_number.toLowerCase().includes(query)) ||
          (item.content && item.content.toLowerCase().includes(query)) ||
          (item.product_name && item.product_name.toLowerCase().includes(query));
        if (!isMatch) return false;
      }
      return true;
    });
  }, [allData, filterStatus, filterMall, startDate, endDate, searchQuery]);

  const groupedData = useMemo(() => {
    const groupsMap: Record<string, DBInquiry[]> = {};

    filteredData.forEach(item => {
      const orderNum = item.order_number?.trim();
      const key = (orderNum && orderNum !== '-' && orderNum !== '') ? orderNum : `single-${item.id}`;
      if (!groupsMap[key]) groupsMap[key] = [];
      groupsMap[key].push(item);
    });

    const groupsArray = Object.values(groupsMap);
    
    groupsArray.forEach(group => {
      group.sort((a, b) => getSafeTime(b.inquiry_date, b.collected_at) - getSafeTime(a.inquiry_date, a.collected_at));
    });

    groupsArray.sort((groupA, groupB) => {
      const timeA = getSafeTime(groupA[0].inquiry_date, groupA[0].collected_at);
      const timeB = getSafeTime(groupB[0].inquiry_date, groupB[0].collected_at);
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB; 
    });

    return groupsArray;
  }, [filteredData, sortOrder]);

  const paginatedData = useMemo(() => {
    const start = page * rowsPerPage;
    return groupedData.slice(start, start + rowsPerPage);
  }, [groupedData, page, rowsPerPage]);

  // ==========================================
  // ⚙️ 5. 액션 핸들러
  // ==========================================
  const allIdsInPage = paginatedData.flatMap(group => group.map(item => item.id));
  const isAllPageSelected = allIdsInPage.length > 0 && allIdsInPage.every(id => selectedIds.includes(id));
  const isSomePageSelected = allIdsInPage.some(id => selectedIds.includes(id)) && !isAllPageSelected;

  const handleSelectAllPageClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) setSelectedIds(prev => Array.from(new Set([...prev, ...allIdsInPage])));
    else setSelectedIds(prev => prev.filter(id => !allIdsInPage.includes(id)));
  };

  const handleClick = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const handleReplyChange = (id: string, newText: string) => {
    setReplyTexts(prev => ({ ...prev, [id]: newText }));
  };

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const handleCollectAll = async () => { setIsCollectingAll(true); try { await fetch("/api/collect", { method: "POST" }); fetchDataAndCounts(); } finally { setIsCollectingAll(false); } };
  const handleBulkSubmit = async () => { setIsSubmitting(true); try { await Promise.all(selectedIds.map(id => supabase.from('inquiries').update({ admin_reply: replyTexts[id], status: '답변저장' }).eq('id', id))); await fetch('/api/reply', { method: 'POST', body: JSON.stringify({ ids: selectedIds }) }); fetchDataAndCounts(); } finally { setIsSubmitting(false); } };
  const handleTriggerBot = async () => { setIsTriggeringBot(true); try { await fetch('/api/trigger-bot', { method: 'POST' }); fetchDataAndCounts(); } finally { setIsTriggeringBot(false); } };

  const handleGenerateAI = async (id: string) => {
    setIsGeneratingAI(prev => ({ ...prev, [id]: true }));
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      setReplyTexts(prev => ({ ...prev, [id]: "개별 생성된 AI 답변입니다. (봇 연동 대기 중)" }));
    } catch (error) {
      console.error("AI 생성 실패:", error);
    } finally {
      setIsGeneratingAI(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleBulkGenerateAI = async () => {
    if (selectedIds.length === 0) return;
    setIsGeneratingBulkAI(true);
    const loadingState: Record<string, boolean> = {};
    selectedIds.forEach(id => { loadingState[id] = true; });
    setIsGeneratingAI(prev => ({ ...prev, ...loadingState }));

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const newReplies: Record<string, string> = {};
      selectedIds.forEach(id => {
        newReplies[id] = "선택된 항목에 대해 일괄 생성된 AI 답변입니다.";
      });
      setReplyTexts(prev => ({ ...prev, ...newReplies }));
    } catch (error) {
      console.error("AI 일괄 생성 실패:", error);
    } finally {
      setIsGeneratingBulkAI(false);
      const doneState: Record<string, boolean> = {};
      selectedIds.forEach(id => { doneState[id] = false; });
      setIsGeneratingAI(prev => ({ ...prev, ...doneState }));
    }
  };

  // ==========================================
  // 🎨 6. 화면 렌더링 (UI)
  // ==========================================
  const SUMMARY_DATA = [
    { title: '전체 문의', count: counts.total, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
    { title: '대기중 (신규포함)', count: counts.pending, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
    { title: '답변저장', count: counts.reviewing, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' },
    { title: '처리완료', count: counts.completed, color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'transparent', color: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      <Box component="header" sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', bgcolor: 'rgba(15, 23, 42, 0.6)', position: 'sticky', top: 0, zIndex: 50 }}>
        <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-1px' }}>
              <span style={{ color: '#3b82f6' }}>N</span>uldam <span style={{ color: '#94a3b8', fontWeight: 300 }}>CX</span>
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b', ml: 1, letterSpacing: '1px' }}>INTEGRATED WORKSPACE</Typography>
          </Box>
          <Stack direction="row" spacing={2}>
            <Button onClick={() => router.push('/status')} sx={{ color: '#cbd5e1', fontWeight: 600 }}>문의현황</Button>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ mt: 2, mb: 8, flex: 1 }}>
        
        {/* --- KPI 요약 보드 --- */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2, overflowX: 'auto', pb: 0.5 }}>
          {SUMMARY_DATA.map((item, index) => (
            <Card key={index} elevation={0} sx={{ flex: 1, minWidth: '150px', bgcolor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', backdropFilter: 'blur(10px)' }}>
              <CardContent sx={{ p: '12px 16px !important' }}>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, mb: 0.5, display: 'block' }}>{item.title}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                  <Typography variant="h5" sx={{ color: item.color, fontWeight: 800 }}>{item.count}</Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>건</Typography>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>

        {/* --- 슈퍼 필터 바 --- */}
        <Box sx={{ px: 1.5, py: 1, mb: 2, bgcolor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Box sx={{ flex: 1, minWidth: '90px' }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', mb: 0.2, fontSize: '0.7rem', display: 'block' }}>정렬</Typography>
            <Select fullWidth size="small" value={sortOrder} onChange={(e) => { setSortOrder(e.target.value); setPage(0); }} sx={{ bgcolor: 'rgba(15, 23, 42, 0.5)', color: '#f8fafc', borderRadius: '6px', fontSize: '0.8rem', height: '32px', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}>
              <MenuItem value="desc" sx={{ fontSize: '0.8rem' }}>최근순</MenuItem>
              <MenuItem value="asc" sx={{ fontSize: '0.8rem' }}>오래된순</MenuItem>
            </Select>
          </Box>
          <Box sx={{ flex: 1, minWidth: '80px' }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', mb: 0.2, fontSize: '0.7rem', display: 'block' }}>상태</Typography>
            <Select fullWidth size="small" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }} sx={{ bgcolor: 'rgba(15, 23, 42, 0.5)', color: '#f8fafc', borderRadius: '6px', fontSize: '0.8rem', height: '32px', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}>
              {STATUS_OPTIONS.map(opt => <MenuItem key={opt} value={opt} sx={{ fontSize: '0.8rem' }}>{opt}</MenuItem>)}
            </Select>
          </Box>
          <Box sx={{ flex: 1, minWidth: '100px' }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', mb: 0.2, fontSize: '0.7rem', display: 'block' }}>쇼핑몰</Typography>
            <Select fullWidth size="small" value={filterMall} onChange={(e) => { setFilterMall(e.target.value); setPage(0); }} sx={{ bgcolor: 'rgba(15, 23, 42, 0.5)', color: '#f8fafc', borderRadius: '6px', fontSize: '0.8rem', height: '32px', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}>
              {MALL_OPTIONS.map(opt => <MenuItem key={opt} value={opt} sx={{ fontSize: '0.8rem' }}>{opt}</MenuItem>)}
            </Select>
          </Box>
          <Box sx={{ flex: 1, minWidth: '90px' }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', mb: 0.2, fontSize: '0.7rem', display: 'block' }}>카테고리</Typography>
            <Select fullWidth size="small" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} sx={{ bgcolor: 'rgba(15, 23, 42, 0.5)', color: '#f8fafc', borderRadius: '6px', fontSize: '0.8rem', height: '32px', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}>
              <MenuItem value="전체" sx={{ fontSize: '0.8rem' }}>전체</MenuItem>
            </Select>
          </Box>
          <Box sx={{ flex: 1.2, minWidth: '110px' }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', mb: 0.2, fontSize: '0.7rem', display: 'block' }}>시작일</Typography>
            <TextField type="date" fullWidth size="small" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(0); }} sx={{ bgcolor: 'rgba(15, 23, 42, 0.5)', borderRadius: '6px', input: { color: '#f8fafc', colorScheme: 'dark', fontSize: '0.8rem', py: '6.5px' }, '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' } }} />
          </Box>
          <Box sx={{ flex: 1.2, minWidth: '110px' }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', mb: 0.2, fontSize: '0.7rem', display: 'block' }}>종료일</Typography>
            <TextField type="date" fullWidth size="small" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(0); }} sx={{ bgcolor: 'rgba(15, 23, 42, 0.5)', borderRadius: '6px', input: { color: '#f8fafc', colorScheme: 'dark', fontSize: '0.8rem', py: '6.5px' }, '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' } }} />
          </Box>
          <Box sx={{ flex: 2, minWidth: '180px' }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', mb: 0.2, fontSize: '0.7rem', display: 'block' }}>검색</Typography>
            <TextField fullWidth size="small" placeholder="고객명, 내용, 주문번호, 상품명" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon sx={{ color: '#64748b', fontSize: '1rem' }} /></InputAdornment>) }} sx={{ bgcolor: 'rgba(15, 23, 42, 0.5)', borderRadius: '6px', input: { color: '#f8fafc', fontSize: '0.8rem', py: '6.5px' }, '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' } }} />
          </Box>
        </Box>

        {/* --- 액션 컨트롤 바 --- */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', mb: 2, px: 2, py: 1.5, bgcolor: 'rgba(30, 41, 59, 0.8)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Checkbox color="primary" size="small" indeterminate={isSomePageSelected} checked={isAllPageSelected} onChange={handleSelectAllPageClick} sx={{ color: '#64748b', '&.Mui-checked': { color: '#3b82f6' } }} />
            <Typography variant="body2" sx={{ color: '#f8fafc', fontWeight: 600 }}>전체 선택 <span style={{ color: '#3b82f6' }}>({selectedIds.length}건)</span></Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="outlined" startIcon={isCollectingAll ? <CircularProgress size={14} color="inherit" /> : <CloudDownloadIcon fontSize="small" />} onClick={handleCollectAll} disabled={isCollectingAll} sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#cbd5e1', fontWeight: 600, '&:hover': { borderColor: '#f8fafc', bgcolor: 'rgba(255,255,255,0.05)' } }}>새로 수집</Button>
            
            <Button 
              size="small" 
              variant="contained" 
              startIcon={isGeneratingBulkAI ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeIcon fontSize="small" />} 
              onClick={handleBulkGenerateAI} 
              disabled={isGeneratingBulkAI || selectedIds.length === 0} 
              sx={{ 
                bgcolor: '#ec4899', color: '#fff', fontWeight: 600, 
                boxShadow: '0 4px 14px rgba(236, 72, 153, 0.4)',
                '&:hover': { bgcolor: '#db2777' },
                '&.Mui-disabled': { bgcolor: 'rgba(236, 72, 153, 0.3)', color: '#fbcfe8' }
              }}
            >
              AI 답변 생성
            </Button>

            <Button size="small" variant="contained" startIcon={<SendIcon fontSize="small" />} onClick={handleBulkSubmit} disabled={isSubmitting || selectedIds.length === 0} sx={{ bgcolor: '#3b82f6', color: '#fff', fontWeight: 600, boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)' }}>1. 답변저장 (임시)</Button>
            <Button size="small" variant="contained" startIcon={isTriggeringBot ? <CircularProgress size={14} color="inherit" /> : <RocketLaunchIcon fontSize="small" />} onClick={handleTriggerBot} disabled={isTriggeringBot || selectedIds.length === 0} sx={{ bgcolor: '#8b5cf6', color: '#fff', fontWeight: 600, '&:hover': { bgcolor: '#7c3aed' }, boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)' }}>2. 쇼핑몰 송신 (봇)</Button>
          </Stack>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: '#3b82f6' }} /></Box>
        ) : paginatedData.length > 0 ? (
          <Stack spacing={2} sx={{ mb: 4 }}>
            {paginatedData.map((group) => {
              const mainItem = group[0]; 
              const subItems = group.slice(1);
              const isMultiple = subItems.length > 0;
              const groupKey = (mainItem.order_number && mainItem.order_number.trim() !== '-' && mainItem.order_number.trim() !== '') ? mainItem.order_number : `single-${mainItem.id}`;
              const expanded = !!expandedGroups[groupKey];
              
              const isMainSelected = selectedIds.includes(mainItem.id);
              const standardChannel = getStandardChannelName(mainItem.channel);
              const mainStatusColor = getStatusColor(mainItem.status);
              const channelAdminUrl = getChannelUrl(standardChannel);

              return (
                <Card key={groupKey} elevation={0} sx={{ bgcolor: isMainSelected ? 'rgba(59, 130, 246, 0.05)' : 'rgba(30, 41, 59, 0.4)', border: `1px solid ${isMainSelected ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)'}`, borderRadius: '12px', transition: '0.2s', '&:hover': { borderColor: isMainSelected ? '#3b82f6' : 'rgba(255,255,255,0.2)' } }}>
                  <CardContent sx={{ p: '16px !important' }}>
                    
                    <Box sx={{ display: 'flex', gap: 1.5 }}>
                      <Box sx={{ pt: 0.5 }}>
                        <Checkbox checked={isMainSelected} onChange={() => handleClick(mainItem.id)} sx={{ color: '#64748b', '&.Mui-checked': { color: '#3b82f6' }, p: 0.5 }} />
                      </Box>
                      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#f8fafc' }}>
                              {mainItem.customer_name}
                            </Typography>
                            <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.2)', my: 0.5 }} />
                            
                            <Typography variant="body2" sx={{ color: '#94a3b8', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                              주문번호: 
                              {mainItem.order_number && mainItem.order_number !== '-' ? (
                                <MuiLink 
                                  href={getSabangnetOrderUrl(mainItem.order_number)} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  sx={{ color: '#3b82f6', ml: 0.5, fontWeight: 600, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                                >
                                  {mainItem.order_number}
                                </MuiLink>
                              ) : (
                                <span style={{ marginLeft: '4px' }}>-</span>
                              )}

                              {mainItem.product_name && mainItem.product_name !== '-' && (
                                <>
                                  <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.2)' }}>|</span>
                                  <span style={{ color: '#cbd5e1', fontWeight: 500 }}>{mainItem.product_name}</span>
                                </>
                              )}
                            </Typography>

                            <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: 0.5 }}>
                              <Chip 
                                component="a"
                                href={channelAdminUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                clickable={channelAdminUrl !== '#'}
                                label={standardChannel} 
                                size="small" 
                                sx={{ 
                                  bgcolor: 'rgba(255,255,255,0.1)', color: '#f8fafc', fontWeight: 600, borderRadius: '4px', height: '22px', fontSize: '0.7rem',
                                  textDecoration: 'none',
                                  '&:hover': channelAdminUrl !== '#' ? { bgcolor: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', cursor: 'pointer' } : {}
                                }} 
                              />
                              <Chip label={mainItem.status} size="small" sx={{ bgcolor: mainStatusColor.bg, color: mainStatusColor.color, fontWeight: 700, borderRadius: '4px', height: '22px', fontSize: '0.7rem' }} />
                            </Stack>
                          </Box>

                          <Typography variant="caption" sx={{ color: '#64748b' }}>
                            문의 일시 : {getDisplayTime(mainItem.inquiry_date, mainItem.collected_at)}
                          </Typography>
                        </Box>
                        
                        <Box>
                          {(mainItem.receiver_name || mainItem.receiver_tel || mainItem.tracking_number || mainItem.shipping_address) && (
                            <Box sx={{ 
                              mt: 0.5, p: 1, px: 1.5, 
                              bgcolor: 'rgba(15, 23, 42, 0.4)', 
                              borderRadius: '8px', 
                              border: '1px solid rgba(59, 130, 246, 0.1)', 
                              display: 'flex', 
                              flexWrap: 'wrap', 
                              alignItems: 'center', 
                              gap: 2 
                            }}>
                              {mainItem.receiver_name && (
                                <Typography variant="caption" sx={{ color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <PersonIcon sx={{ fontSize: 14, color: '#94a3b8' }} /> 
                                  <span style={{ fontWeight: 600, color: '#f8fafc' }}>수령인 : {mainItem.receiver_name}</span>
                                </Typography>
                              )}
                              {mainItem.receiver_name && mainItem.receiver_tel && (
                                <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)', height: '14px', my: 'auto' }} />
                              )}
                              {mainItem.receiver_tel && (
                                <Typography variant="caption" sx={{ color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <PhoneIcon sx={{ fontSize: 14, color: '#94a3b8' }} /> 
                                  <span style={{ fontWeight: 600, color: '#f8fafc' }}>연락처 : {mainItem.receiver_tel}</span>
                                </Typography>
                              )}
                              {mainItem.receiver_tel && mainItem.shipping_address && (
                                <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)', height: '14px', my: 'auto' }} />
                              )}
                              {mainItem.shipping_address && (
                                <Typography variant="caption" sx={{ color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <HomeIcon sx={{ fontSize: 14, color: '#94a3b8' }} /> 
                                  <span style={{ color: '#f8fafc' }}>주소 : {mainItem.shipping_address}</span>
                                </Typography>
                              )}
                              {mainItem.shipping_address && mainItem.tracking_number && (
                                <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)', height: '14px', my: 'auto' }} />
                              )}
                              {mainItem.tracking_number && (
                                <Typography variant="caption" sx={{ color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <LocalShippingIcon sx={{ fontSize: 14, color: '#10b981' }} /> 
                                  <MuiLink 
                                    href={getTrackingUrl(mainItem.channel, mainItem.tracking_number)} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    sx={{ 
                                      ml: 0.5, fontWeight: 700, color: '#10b981', textDecoration: 'none',
                                      '&:hover': { textDecoration: 'underline' }
                                    }}
                                  >
                                    {formatTrackingNumber(mainItem.tracking_number)}
                                  </MuiLink>
                                </Typography>
                              )}
                            </Box>
                          )}
                        </Box>
                        
                        <Box sx={{ bgcolor: 'rgba(15, 23, 42, 0.6)', p: 1.5, borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                          <Typography variant="body2" sx={{ color: '#cbd5e1', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{mainItem.content}</Typography>
                        </Box>
                        
                        <Box sx={{ position: 'relative' }}>
                          <TextField 
                            multiline fullWidth minRows={2} maxRows={6} size="small" 
                            value={replyTexts[mainItem.id] !== undefined ? replyTexts[mainItem.id] : ''} 
                            onChange={(e) => handleReplyChange(mainItem.id, e.target.value)} 
                            placeholder={mainItem.status === '처리완료' ? "처리 완료된 문의입니다." : "답변 작성"}
                            disabled={mainItem.status === '처리완료'}
                            sx={{ 
                              '& .MuiOutlinedInput-root': { 
                                bgcolor: 'rgba(15, 23, 42, 0.8)', color: '#f8fafc', borderRadius: '8px', fontSize: '0.85rem', p: 1.5, pr: 12,
                                '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' }, 
                                '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' }, 
                                '&.Mui-focused fieldset': { borderColor: '#3b82f6' } 
                              } 
                            }} 
                          />
                          
                          <Button
                            size="small"
                            variant="contained"
                            disabled={isGeneratingAI[mainItem.id] || mainItem.status === '처리완료'}
                            onClick={() => handleGenerateAI(mainItem.id)}
                            startIcon={isGeneratingAI[mainItem.id] ? <CircularProgress size={12} color="inherit" /> : <SmartToyIcon sx={{ fontSize: 16 }} />}
                            sx={{
                              position: 'absolute', right: 8, bottom: 8,
                              bgcolor: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa',
                              border: '1px solid rgba(139, 92, 246, 0.3)',
                              fontWeight: 600, fontSize: '0.7rem', height: '24px', py: 0, px: 1,
                              borderRadius: '6px',
                              '&:hover': { bgcolor: 'rgba(139, 92, 246, 0.4)' },
                              '&.Mui-disabled': { bgcolor: 'transparent', color: '#64748b', borderColor: 'transparent' }
                            }}
                          >
                            {isGeneratingAI[mainItem.id] ? '생성 중...' : 'AI 답변'}
                          </Button>
                        </Box>
                        
                        {mainItem.ai_draft && !mainItem.admin_reply && (
                          <Typography variant="caption" sx={{ color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 0.5, mt: -1 }}>
                            <AutoAwesomeIcon sx={{ fontSize: 12 }} /> AI 작성 초안
                          </Typography>
                        )}

                        {isMultiple && (
                          <Box sx={{ mt: 1, textAlign: 'center' }}>
                            <Button
                              onClick={() => toggleGroup(groupKey)}
                              endIcon={expanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                              sx={{ color: '#94a3b8', fontSize: '0.8rem', bgcolor: 'rgba(255,255,255,0.02)', borderRadius: '20px', px: 3, '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' } }}
                            >
                              이전 묶음 문의 {subItems.length}건 {expanded ? '접기' : '펼쳐보기'}
                            </Button>
                          </Box>
                        )}

                        <Collapse in={expanded} timeout="auto" unmountOnExit>
                          <Box sx={{ mt: 1, pt: 2, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                            <Stack spacing={2} sx={{ pl: 2, borderLeft: '2px solid rgba(59, 130, 246, 0.3)' }}>
                              {subItems.map(subItem => {
                                const isSubSelected = selectedIds.includes(subItem.id);
                                const subStatusColor = getStatusColor(subItem.status);
                                const subChannelAdminUrl = getChannelUrl(getStandardChannelName(subItem.channel)); 

                                return (
                                  <Box key={subItem.id} sx={{ display: 'flex', gap: 1.5 }}>
                                    <Box sx={{ pt: 0.5 }}>
                                      <Checkbox size="small" checked={isSubSelected} onChange={() => handleClick(subItem.id)} sx={{ color: '#64748b', '&.Mui-checked': { color: '#3b82f6' }, p: 0 }} />
                                    </Box>
                                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Chip label={subItem.status} size="small" sx={{ bgcolor: subStatusColor.bg, color: subStatusColor.color, fontWeight: 700, borderRadius: '4px', height: '20px', fontSize: '0.7rem' }} />
                                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                                          {getDisplayTime(subItem.inquiry_date, subItem.collected_at)}
                                        </Typography>
                                      </Box>
                                      <Box sx={{ bgcolor: 'rgba(15, 23, 42, 0.3)', p: 1.5, borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                        <Typography variant="body2" sx={{ color: '#94a3b8', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{subItem.content}</Typography>
                                      </Box>
                                      <Box sx={{ position: 'relative' }}>
                                        <TextField 
                                          fullWidth minRows={1} maxRows={4} size="small" 
                                          value={replyTexts[subItem.id] !== undefined ? replyTexts[subItem.id] : ''} 
                                          onChange={(e) => handleReplyChange(subItem.id, e.target.value)} 
                                          placeholder={subItem.status === '처리완료' ? "처리 완료된 문의입니다." : "답변 작성"}
                                          disabled={subItem.status === '처리완료'}
                                          sx={{ 
                                            '& .MuiOutlinedInput-root': { 
                                              bgcolor: 'rgba(15, 23, 42, 0.4)', color: '#94a3b8', borderRadius: '8px', fontSize: '0.8rem', p: 1, pr: 12,
                                              '& fieldset': { borderColor: 'rgba(255,255,255,0.05)' } 
                                            } 
                                          }} 
                                        />
                                        <Button
                                          size="small"
                                          disabled={isGeneratingAI[subItem.id] || subItem.status === '처리완료'}
                                          onClick={() => handleGenerateAI(subItem.id)}
                                          startIcon={isGeneratingAI[subItem.id] ? <CircularProgress size={10} color="inherit" /> : <SmartToyIcon sx={{ fontSize: 14 }} />}
                                          sx={{
                                            position: 'absolute', right: 4, bottom: 4,
                                            bgcolor: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa',
                                            fontWeight: 600, fontSize: '0.65rem', height: '20px', py: 0, px: 1,
                                            borderRadius: '4px',
                                            '&:hover': { bgcolor: 'rgba(139, 92, 246, 0.3)' }
                                          }}
                                        >
                                          AI 답변
                                        </Button>
                                      </Box>
                                    </Box>
                                  </Box>
                                )
                              })}
                            </Stack>
                          </Box>
                        </Collapse>

                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        ) : (
          <Box sx={{ textAlign: 'center', py: 10, bgcolor: 'rgba(30, 41, 59, 0.4)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <Typography variant="body1" sx={{ color: '#64748b' }}>조건에 맞는 문의 내역이 없습니다.</Typography>
          </Box>
        )}

        {groupedData.length > 0 && (
          <TablePagination component="div" count={groupedData.length} page={page} onPageChange={(e, newPage) => setPage(newPage)} rowsPerPage={rowsPerPage} onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }} rowsPerPageOptions={[5, 10, 25, 50]} labelRowsPerPage="페이지당 문의 그룹 수:" sx={{ color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.1)', mt: 2 }} />
        )}

      </Container>
    </Box>
  );
}