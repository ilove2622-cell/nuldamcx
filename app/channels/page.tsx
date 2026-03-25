'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// MUI
import {
  Box, Container, Typography, IconButton, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Tabs, Tab, TablePagination, Chip, TextField, Checkbox, Stack, CircularProgress
} from '@mui/material';

// Icons
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SendIcon from '@mui/icons-material/Send';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';

const SITE_TABS = ['전체', '네이버', '쿠팡', '톡스토어', '이베이', '11번가', '롯데온', '카카오 지그재그', 'toss', '기타'];

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
  created_at?: string; // 정렬을 위해 생성 시간 추가
}

export default function ChannelsWorkspacePage() {
  const router = useRouter();
  
  const [allData, setAllData] = useState<DBInquiry[]>([]);
  const [currentTab, setCurrentTab] = useState(0); 
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTriggeringBot, setIsTriggeringBot] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    // 🌟 1차 정렬: DB에서 가져올 때부터 문의일자 역순, 생성일자 역순으로 가져옵니다.
    const { data, error } = await supabase
      .from('inquiries')
      .select('*')
      .order('inquiry_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('데이터 불러오기 실패:', error);
    } else {
      setAllData(data || []);
      const initialReplies: Record<string, string> = {};
      data?.forEach(item => {
        initialReplies[item.id] = item.admin_reply || item.ai_draft || '';
      });
      setReplyTexts(initialReplies);
    }
    setLoading(false);
    setSelectedIds([]);
  };

  useEffect(() => { fetchData(); }, []);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
    setPage(0); 
    setSelectedIds([]);
  };

  const filteredData = useMemo(() => {
    const targetSite = SITE_TABS[currentTab];
    let filtered = allData;

    // 1. 탭 필터링
    if (targetSite !== '전체') {
      if (targetSite === '기타') {
        const mainChannels = SITE_TABS.slice(1, -1);
        filtered = allData.filter(item => !mainChannels.includes(item.channel));
      } else {
        filtered = allData.filter(item => item.channel === targetSite);
      }
    }

    // 🌟 2. 시간 순 강력 정렬 (프론트엔드)
    // inquiry_date(문의 시간)를 기준으로 먼저 정렬하고, 없을 경우 DB 저장 시간(created_at)을 기준으로 최신순(내림차순) 정렬합니다.
    return filtered.sort((a, b) => {
      const timeA = new Date(a.inquiry_date || a.created_at || 0).getTime();
      const timeB = new Date(b.inquiry_date || b.created_at || 0).getTime();
      return timeB - timeA; 
    });
  }, [allData, currentTab]);

  const paginatedData = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredData.slice(start, start + rowsPerPage);
  }, [filteredData, page, rowsPerPage]);

  const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedIds(paginatedData.map((n) => n.id));
      return;
    }
    setSelectedIds([]);
  };

  const handleClick = (id: string) => {
    const selectedIndex = selectedIds.indexOf(id);
    let newSelected: string[] = [];
    if (selectedIndex === -1) newSelected = newSelected.concat(selectedIds, id);
    else if (selectedIndex === 0) newSelected = newSelected.concat(selectedIds.slice(1));
    else if (selectedIndex === selectedIds.length - 1) newSelected = newSelected.concat(selectedIds.slice(0, -1));
    else if (selectedIndex > 0) newSelected = newSelected.concat(selectedIds.slice(0, selectedIndex), selectedIds.slice(selectedIndex + 1));
    setSelectedIds(newSelected);
  };

  const isSelected = (id: string) => selectedIds.indexOf(id) !== -1;

  const handleReplyChange = (id: string, newText: string) => {
    setReplyTexts(prev => ({ ...prev, [id]: newText }));
  };

  const handleBulkSubmit = async () => {
    if (selectedIds.length === 0) return;
    setIsSubmitting(true);

    try {
      const updatePromises = selectedIds.map(id => {
        return supabase
          .from('inquiries')
          .update({ admin_reply: replyTexts[id], status: '답변저장' })
          .eq('id', id);
      });
      await Promise.all(updatePromises);
      
      const res = await fetch('/api/reply', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }) 
      });
      const result = await res.json();

      if (res.ok) {
        const responsePreview = result.sabangnetResponse 
          ? result.sabangnetResponse.substring(0, 150) 
          : "응답 없음";

        alert(`✅ 1단계: 사방넷 임시등록 호출 완료 (${result.count}건)\n우측의 [쇼핑몰로 최종 답변 송신] 버튼을 눌러 발송을 완료해주세요.\n(자세한 에러는 F12 콘솔창 확인!)`);
      } else {
        alert(`❌ 사방넷 등록 실패: ${result.message}`);
      }
      
      fetchData();
      
    } catch (error) {
      console.error(error);
      alert('일괄 처리 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTriggerBot = async () => {
    if (isTriggeringBot) return;
    setIsTriggeringBot(true);

    try {
      const res = await fetch('/api/trigger-bot', { method: 'POST' });
      
      if (res.ok) {
        alert('🤖 송신 봇에게 전송 요청을 보냈습니다!\n로컬 PC의 봇이 사방넷에서 답변을 전송한 뒤 상태를 "처리완료"로 변경할 것입니다.');
        fetchData();
      } else {
        const errorData = await res.json();
        alert(`❌ 봇 호출 실패: ${errorData.message}`);
      }
    } catch (error) {
      console.error(error);
      alert('❌ 서버와 연결할 수 없습니다.');
    } finally {
      setIsTriggeringBot(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case '대기': return { color: '#f59e0b', bgcolor: 'rgba(245, 158, 11, 0.1)' };
      case '답변저장': return { color: '#3b82f6', bgcolor: 'rgba(59, 130, 246, 0.1)' };
      case '전송요청': return { color: '#8b5cf6', bgcolor: 'rgba(139, 92, 246, 0.1)' }; 
      case '처리완료': return { color: '#10b981', bgcolor: 'rgba(16, 185, 129, 0.1)' }; 
      default: return { color: '#94a3b8', bgcolor: 'rgba(148, 163, 184, 0.1)' };
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'transparent', color: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      <Box component="header" sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(15, 23, 42, 0.6)', p: 2, position: 'sticky', top: 0, zIndex: 50 }}>
        <Container maxWidth="xl" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton onClick={() => router.push('/')} sx={{ color: '#cbd5e1' }}><ArrowBackIcon /></IconButton>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>🌐 사이트별 보기 (워크스페이스)</Typography>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ mt: 4, mb: 8, flex: 1 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'rgba(255,255,255,0.1)', mb: 3 }}>
          <Tabs value={currentTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto" textColor="inherit" TabIndicatorProps={{ style: { backgroundColor: '#3b82f6' } }}>
            {SITE_TABS.map((site, index) => (
              <Tab key={index} label={site} sx={{ fontWeight: 600, color: currentTab === index ? '#3b82f6' : '#94a3b8' }} />
            ))}
          </Tabs>
        </Box>

        <Box sx={{ mb: 2, p: 2, bgcolor: 'rgba(30, 41, 59, 0.6)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {selectedIds.length > 0 ? (
              <>
                <Typography sx={{ color: '#3b82f6', fontWeight: 700 }}>체크됨: {selectedIds.length}건</Typography>
                <Button variant="contained" color="primary" startIcon={<SendIcon />} onClick={handleBulkSubmit} disabled={isSubmitting} sx={{ fontWeight: 600, borderRadius: '8px', boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)' }}>
                  {isSubmitting ? '사방넷 등록 중...' : '1. 작성한 답변 사방넷으로 임시등록'}
                </Button>
              </>
            ) : (
              <Typography variant="body2" sx={{ color: '#94a3b8' }}>목록을 체크하여 사방넷에 답변을 등록하세요.</Typography>
            )}
          </Box>

          <Button variant="contained" startIcon={isTriggeringBot ? <CircularProgress size={20} color="inherit" /> : <RocketLaunchIcon />} onClick={handleTriggerBot} disabled={isTriggeringBot} sx={{ fontWeight: 700, borderRadius: '8px', bgcolor: '#8b5cf6', '&:hover': { bgcolor: '#7c3aed' }, boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)' }}>
            {isTriggeringBot ? '요청 전송 중...' : '2. 쇼핑몰로 최종 답변 송신 (봇 작동)'}
          </Button>
        </Box>

        <TableContainer component={Paper} sx={{ bgcolor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}>
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <Typography sx={{ fontWeight: 600 }}>{SITE_TABS[currentTab]} 문의 목록</Typography>
            <Chip label={`총 ${filteredData.length}건`} color="primary" size="small" />
          </Box>
          <Table>
            <TableHead sx={{ bgcolor: 'rgba(15, 23, 42, 0.8)' }}>
              <TableRow>
                <TableCell padding="checkbox" sx={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <Checkbox color="primary" indeterminate={selectedIds.length > 0 && selectedIds.length < paginatedData.length} checked={paginatedData.length > 0 && selectedIds.length === paginatedData.length} onChange={handleSelectAllClick} icon={<CheckBoxOutlineBlankIcon sx={{ color: '#64748b' }} />} checkedIcon={<CheckBoxIcon sx={{ color: '#3b82f6' }} />} />
                </TableCell>
                <TableCell sx={{ color: '#94a3b8', width: '200px', fontWeight: 600 }}>고객/주문 정보</TableCell>
                <TableCell sx={{ color: '#94a3b8', width: '35%', fontWeight: 600 }}>원본 문의 내용</TableCell>
                <TableCell sx={{ color: '#94a3b8', width: '45%', fontWeight: 600 }}>답변 작성 (AI 초안 수정)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} align="center" sx={{ py: 6, color: '#64748b' }}>데이터를 불러오는 중입니다...</TableCell></TableRow>
              ) : paginatedData.length > 0 ? (
                paginatedData.map((row) => {
                  const isItemSelected = isSelected(row.id);
                  const statusColors = getStatusColor(row.status); 
                  
                  return (
                    <TableRow key={row.id} hover selected={isItemSelected} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' }, '&.Mui-selected': { bgcolor: 'rgba(59, 130, 246, 0.08)' }, '&.Mui-selected:hover': { bgcolor: 'rgba(59, 130, 246, 0.12)' } }}>
                      <TableCell padding="checkbox" sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top', pt: 2.5 }}>
                        <Checkbox color="primary" checked={isItemSelected} onChange={() => handleClick(row.id)} icon={<CheckBoxOutlineBlankIcon sx={{ color: '#64748b' }} />} checkedIcon={<CheckBoxIcon sx={{ color: '#3b82f6' }} />} />
                      </TableCell>
                      <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top', pt: 3 }}>
                        <Stack spacing={1}>
                          <Chip label={row.status} size="small" sx={{ fontWeight: 'bold', width: 'fit-content', color: statusColors.color, bgcolor: statusColors.bgcolor }}/>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#f8fafc' }}>{row.customer_name}</Typography>
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>{row.channel}</Typography>
                          <Typography variant="caption" sx={{ color: '#64748b', fontFamily: 'monospace' }}>{row.order_number}</Typography>
                          <Typography variant="caption" sx={{ color: '#64748b' }}>{row.inquiry_date}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top', pt: 3 }}>
                        <Box sx={{ bgcolor: 'rgba(15, 23, 42, 0.4)', p: 2, borderRadius: '8px', height: '100%' }}>
                          <Typography variant="body2" sx={{ color: '#cbd5e1', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{row.content}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top', pt: 3 }}>
                        <TextField multiline fullWidth minRows={3} maxRows={8} value={replyTexts[row.id] !== undefined ? replyTexts[row.id] : ''} onChange={(e) => handleReplyChange(row.id, e.target.value)} placeholder="답변을 작성해주세요." sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(15, 23, 42, 0.8)', color: '#f8fafc', borderRadius: '8px', fontSize: '0.875rem', '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' }, '&.Mui-focused fieldset': { borderColor: '#3b82f6' }, } }} />
                        {row.ai_draft && !row.admin_reply && (
                          <Typography variant="caption" sx={{ color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                            <AutoAwesomeIcon sx={{ fontSize: 14 }} /> AI가 작성한 초안입니다.
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow><TableCell colSpan={4} align="center" sx={{ py: 6, color: '#64748b', borderBottom: 'none' }}>데이터가 없습니다.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination component="div" count={filteredData.length} page={page} onPageChange={(e, newPage) => setPage(newPage)} rowsPerPage={rowsPerPage} onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }} rowsPerPageOptions={[5, 10, 25, 50]} labelRowsPerPage="페이지당 항목 수:" sx={{ color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.1)' }} />
        </TableContainer>
      </Container>
    </Box>
  );
}