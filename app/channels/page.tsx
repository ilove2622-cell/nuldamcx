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
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'; // 🚀 봇 실행용 새 아이콘

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
  
  // 버튼 로딩 상태 분리
  const [isSubmitting, setIsSubmitting] = useState(false); // 사방넷 등록 로딩
  const [isTriggeringBot, setIsTriggeringBot] = useState(false); // 봇 실행 로딩

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('inquiries')
      .select('*')
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
    if (targetSite === '전체') return allData;
    if (targetSite === '기타') {
      const mainChannels = SITE_TABS.slice(1, -1);
      return allData.filter(item => !mainChannels.includes(item.channel));
    }
    return allData.filter(item => item.channel === targetSite);
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

  // 🌟 [버튼 1] 사방넷 API로 '답변저장' 상태로 등록
  const handleBulkSubmit = async () => {
    if (selectedIds.length === 0) return;
    setIsSubmitting(true);

    try {
      const updatePromises = selectedIds.map(id => {
        return supabase
          .from('inquiries')
          .update({ admin_reply: replyTexts[id], status: '전송대기' })
          .eq('id', id);
      });
      await Promise.all(updatePromises);
      
      const res = await fetch('/api/reply', { method: 'POST' });
      const result = await res.json();

      if (res.ok) {
        alert(`✅ 사방넷 등록 성공! (${result.count}건)\n우측의 [쇼핑몰로 최종 답변 송신] 버튼을 눌러 발송을 완료해주세요.`);
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

  // 🌟 [버튼 2] 항상 보이는 봇 실행 버튼 핸들러
  const handleTriggerBot = async () => {
    if (isTriggeringBot) return;
    setIsTriggeringBot(true);

    try {
      // 🚨 주의: 아래 주소를 본인의 실제 Railway 주소로 꼭 변경해주세요! 🚨
      const RAILWAY_BOT_URL = 'https://본인의_RAILWAY_주소.up.railway.app/trigger-bot';
      
      const res = await fetch(RAILWAY_BOT_URL, { method: 'POST' });
      
      if (res.ok) {
        alert('🤖 송신 봇이 백그라운드에서 실행되었습니다!\n사방넷에서 각 쇼핑몰로 답변을 전송하고 있습니다. (약 1~3분 소요)');
      } else {
        alert('❌ 봇 실행 실패. 봇 서버 상태를 확인해주세요.');
      }
    } catch (error) {
      console.error(error);
      alert('❌ 봇 서버와 연결할 수 없습니다. (Railway 서버가 켜져 있는지 확인)');
    } finally {
      setIsTriggeringBot(false);
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

        {/* 🌟 항상 보이는 액션 바 (좌측: 선택 등록 / 우측: 봇 실행) */}
        <Box sx={{ 
          mb: 2, p: 2, 
          bgcolor: 'rgba(30, 41, 59, 0.6)', 
          borderRadius: '12px', 
          border: '1px solid rgba(255, 255, 255, 0.1)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          {/* 좌측 액션 영역 (항목 선택 시에만 버튼 활성화) */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {selectedIds.length > 0 ? (
              <>
                <Typography sx={{ color: '#3b82f6', fontWeight: 700 }}>
                  체크됨: {selectedIds.length}건
                </Typography>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<SendIcon />}
                  onClick={handleBulkSubmit}
                  disabled={isSubmitting}
                  sx={{ fontWeight: 600, borderRadius: '8px', boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)' }}
                >
                  {isSubmitting ? '사방넷 등록 중...' : '1. 작성한 답변 사방넷으로 임시등록'}
                </Button>
              </>
            ) : (
              <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                목록을 체크하여 사방넷에 답변을 등록하세요.
              </Typography>
            )}
          </Box>

          {/* 우측 봇 실행 영역 (항상 활성화) */}
          <Button
            variant="contained"
            startIcon={isTriggeringBot ? <CircularProgress size={20} color="inherit" /> : <RocketLaunchIcon />}
            onClick={handleTriggerBot}
            disabled={isTriggeringBot}
            sx={{ 
              fontWeight: 700, 
              borderRadius: '8px', 
              bgcolor: '#8b5cf6', 
              '&:hover': { bgcolor: '#7c3aed' },
              boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)' 
            }}
          >
            {isTriggeringBot ? '봇 호출 중...' : '2. 쇼핑몰로 최종 답변 송신 (봇 작동)'}
          </Button>
        </Box>

        {/* 테이블 본문 */}
        <TableContainer component={Paper} sx={{ bgcolor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}>
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <Typography sx={{ fontWeight: 600 }}>{SITE_TABS[currentTab]} 문의 목록</Typography>
            <Chip label={`총 ${filteredData.length}건`} color="primary" size="small" />
          </Box>
          <Table>
            <TableHead sx={{ bgcolor: 'rgba(15, 23, 42, 0.8)' }}>
              <TableRow>
                <TableCell padding="checkbox" sx={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <Checkbox
                    color="primary"
                    indeterminate={selectedIds.length > 0 && selectedIds.length < paginatedData.length}
                    checked={paginatedData.length > 0 && selectedIds.length === paginatedData.length}
                    onChange={handleSelectAllClick}
                    icon={<CheckBoxOutlineBlankIcon sx={{ color: '#64748b' }} />}
                    checkedIcon={<CheckBoxIcon sx={{ color: '#3b82f6' }} />}
                  />
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
                  return (
                    <TableRow 
                      key={row.id} 
                      hover 
                      selected={isItemSelected}
                      sx={{ 
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
                        '&.Mui-selected': { bgcolor: 'rgba(59, 130, 246, 0.08)' },
                        '&.Mui-selected:hover': { bgcolor: 'rgba(59, 130, 246, 0.12)' }
                      }}
                    >
                      <TableCell padding="checkbox" sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top', pt: 2.5 }}>
                        <Checkbox
                          color="primary"
                          checked={isItemSelected}
                          onChange={() => handleClick(row.id)}
                          icon={<CheckBoxOutlineBlankIcon sx={{ color: '#64748b' }} />}
                          checkedIcon={<CheckBoxIcon sx={{ color: '#3b82f6' }} />}
                        />
                      </TableCell>
                      <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top', pt: 3 }}>
                        <Stack spacing={1}>
                          <Chip label={row.status} size="small" sx={{
                            fontWeight: 'bold', width: 'fit-content',
                            color: row.status === '대기' ? '#f59e0b' : row.status === '처리완료' ? '#10b981' : '#3b82f6',
                            bgcolor: row.status === '대기' ? 'rgba(245, 158, 11, 0.1)' : row.status === '처리완료' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)'
                          }}/>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#f8fafc' }}>{row.customer_name}</Typography>
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>{row.channel}</Typography>
                          <Typography variant="caption" sx={{ color: '#64748b', fontFamily: 'monospace' }}>{row.order_number}</Typography>
                          <Typography variant="caption" sx={{ color: '#64748b' }}>{row.inquiry_date}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top', pt: 3 }}>
                        <Box sx={{ bgcolor: 'rgba(15, 23, 42, 0.4)', p: 2, borderRadius: '8px', height: '100%' }}>
                          <Typography variant="body2" sx={{ color: '#cbd5e1', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                            {row.content}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top', pt: 3 }}>
                        <TextField
                          multiline
                          fullWidth
                          minRows={3}
                          maxRows={8}
                          value={replyTexts[row.id] !== undefined ? replyTexts[row.id] : ''}
                          onChange={(e) => handleReplyChange(row.id, e.target.value)}
                          placeholder="답변을 작성해주세요."
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              bgcolor: 'rgba(15, 23, 42, 0.8)', color: '#f8fafc', borderRadius: '8px', fontSize: '0.875rem',
                              '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                              '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                              '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                            }
                          }}
                        />
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
          <TablePagination
            component="div"
            count={filteredData.length}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[5, 10, 25, 50]}
            labelRowsPerPage="페이지당 항목 수:"
            sx={{ color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.1)' }}
          />
        </TableContainer>
      </Container>
    </Box>
  );
}