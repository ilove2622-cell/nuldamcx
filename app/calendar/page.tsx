'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // ★ Supabase 불러오기

// MUI
import {
  Box, Container, Typography, IconButton, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TablePagination, Chip, TextField, Checkbox, Stack
} from '@mui/material';

// Icons
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SendIcon from '@mui/icons-material/Send';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';

// DB에서 불러올 데이터 타입 정의
interface DBInquiry {
  id: string;
  channel: string;
  order_number: string;
  customer_name: string;
  content: string;
  inquiry_date: string;
  status: string;
  ai_draft: string | null;     // ★ 추가됨
  admin_reply: string | null;  // ★ 추가됨
}

export default function DateOverviewWorkspacePage() {
  const router = useRouter();
  
  // 상태 관리 (기본값: 오늘 날짜)
  const todayStr = new Date().toISOString().split('T')[0];
  const [targetDate, setTargetDate] = useState(todayStr);
  
  // DB 데이터 및 로딩 상태
  const [allData, setAllData] = useState<DBInquiry[]>([]);
  const [loading, setLoading] = useState(true);

  // 페이지네이션 상태
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // ★ 일괄 처리 및 인라인 편집을 위한 상태
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Supabase에서 데이터 불러오기 (날짜 기준 필터링)
  const fetchData = async (dateStr: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('inquiries')
      .select('*')
      .eq('inquiry_date', dateStr) 
      .order('created_at', { ascending: false }); 

    if (error) {
      console.error('데이터 불러오기 실패:', error);
    } else {
      setAllData(data || []);
      
      // ★ 데이터를 불러올 때, 기존 답변이나 AI 초안을 입력창 초기값으로 세팅
      const initialReplies: Record<string, string> = {};
      data?.forEach(item => {
        initialReplies[item.id] = item.admin_reply || item.ai_draft || '';
      });
      setReplyTexts(initialReplies);
    }
    setLoading(false);
    setSelectedIds([]); // 날짜나 데이터가 바뀌면 선택 해제
  };

  // 날짜가 변경될 때마다 DB 데이터 다시 불러오기
  useEffect(() => {
    fetchData(targetDate);
    setPage(0); // 날짜가 바뀌면 1페이지로 리셋
  }, [targetDate]);

  // 페이지네이션 처리
  const paginatedData = useMemo(() => {
    const start = page * rowsPerPage;
    return allData.slice(start, start + rowsPerPage);
  }, [allData, page, rowsPerPage]);

  // ★ 체크박스 로직
  const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const newSelecteds = paginatedData.map((n) => n.id);
      setSelectedIds(newSelecteds);
      return;
    }
    setSelectedIds([]);
  };

  const handleClick = (id: string) => {
    const selectedIndex = selectedIds.indexOf(id);
    let newSelected: string[] = [];

    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selectedIds, id);
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selectedIds.slice(1));
    } else if (selectedIndex === selectedIds.length - 1) {
      newSelected = newSelected.concat(selectedIds.slice(0, -1));
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(
        selectedIds.slice(0, selectedIndex),
        selectedIds.slice(selectedIndex + 1),
      );
    }
    setSelectedIds(newSelected);
  };

  const isSelected = (id: string) => selectedIds.indexOf(id) !== -1;

  // ★ 인라인 텍스트 편집 핸들러
  const handleReplyChange = (id: string, newText: string) => {
    setReplyTexts(prev => ({ ...prev, [id]: newText }));
  };

  // ★ 일괄 처리(Bulk Submit) 실행
  const handleBulkSubmit = async () => {
    if (selectedIds.length === 0) return;
    setIsSubmitting(true);

    try {
      // 선택된 ID들을 순회하며 Supabase 업데이트 실행
      const updatePromises = selectedIds.map(id => {
        return supabase
          .from('inquiries')
          .update({ 
            admin_reply: replyTexts[id], 
            status: '처리완료' 
          })
          .eq('id', id);
      });

      await Promise.all(updatePromises);
      
      alert(`✅ ${selectedIds.length}건의 답변이 일괄 등록/처리완료 되었습니다.`);
      fetchData(targetDate); // 최신 상태로 새로고침
      
    } catch (error) {
      console.error(error);
      alert('일괄 처리 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'transparent', color: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      
      {/* 1. 상단 바 */}
      <Box component="header" sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(15, 23, 42, 0.6)', p: 2, position: 'sticky', top: 0, zIndex: 50 }}>
        {/* 와이드 뷰 xl 적용 */}
        <Container maxWidth="xl" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton onClick={() => router.push('/')} sx={{ color: '#cbd5e1' }}><ArrowBackIcon /></IconButton>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>📅 날짜별 보기 (워크스페이스)</Typography>
            
            {/* 날짜 선택기 */}
            <TextField
              type="date"
              size="small"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              sx={{ 
                ml: 2, 
                bgcolor: 'rgba(255,255,255,0.1)', 
                borderRadius: 1,
                input: { color: '#fff', fontSize: '0.9rem', fontWeight: 'bold' },
                colorScheme: 'dark'
              }}
            />
          </Box>
        </Container>
      </Box>

      {/* 와이드 뷰 xl 적용 */}
      <Container maxWidth="xl" sx={{ mt: 4, mb: 8, flex: 1 }}>
        
        {/* ★ 일괄 처리 액션 바 */}
        {selectedIds.length > 0 && (
          <Box sx={{ mb: 3, p: 2, bgcolor: 'rgba(59, 130, 246, 0.15)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', animation: 'fadeIn 0.3s' }}>
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
              {isSubmitting ? '처리 중...' : '선택된 항목 일괄 처리완료'}
            </Button>
          </Box>
        )}

        {/* 2. 데이터 테이블 (워크스페이스 폼) */}
        <TableContainer component={Paper} sx={{ bgcolor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}>
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <Typography sx={{ fontWeight: 600 }}>{targetDate} 통합 문의 목록</Typography>
            <Chip label={`총 ${allData.length}건`} color="primary" size="small" />
          </Box>
          <Table>
            <TableHead sx={{ bgcolor: 'rgba(15, 23, 42, 0.8)' }}>
              <TableRow>
                {/* 체크박스 헤더 */}
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
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 6, color: '#64748b' }}>데이터를 불러오는 중입니다...</TableCell>
                </TableRow>
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
                      {/* 1. 체크박스 */}
                      <TableCell padding="checkbox" sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top', pt: 2.5 }}>
                        <Checkbox
                          color="primary"
                          checked={isItemSelected}
                          onChange={() => handleClick(row.id)}
                          icon={<CheckBoxOutlineBlankIcon sx={{ color: '#64748b' }} />}
                          checkedIcon={<CheckBoxIcon sx={{ color: '#3b82f6' }} />}
                        />
                      </TableCell>

                      {/* 2. 고객/주문 정보 */}
                      <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top', pt: 3 }}>
                        <Stack spacing={1}>
                          <Chip label={row.status} size="small" sx={{
                            fontWeight: 'bold', width: 'fit-content',
                            color: row.status === '대기중' ? '#f59e0b' : row.status === '처리완료' ? '#10b981' : '#3b82f6',
                            bgcolor: row.status === '대기중' ? 'rgba(245, 158, 11, 0.1)' : row.status === '처리완료' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)'
                          }}/>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#f8fafc' }}>{row.customer_name}</Typography>
                          <Typography variant="caption" sx={{ color: '#f59e0b', fontWeight: 'bold' }}>{row.channel}</Typography>
                          <Typography variant="caption" sx={{ color: '#64748b', fontFamily: 'monospace' }}>{row.order_number}</Typography>
                          <Typography variant="caption" sx={{ color: '#64748b' }}>{row.inquiry_date}</Typography>
                        </Stack>
                      </TableCell>

                      {/* 3. 원본 문의 내용 */}
                      <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top', pt: 3 }}>
                        <Box sx={{ bgcolor: 'rgba(15, 23, 42, 0.4)', p: 2, borderRadius: '8px', height: '100%' }}>
                          <Typography variant="body2" sx={{ color: '#cbd5e1', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                            {row.content}
                          </Typography>
                        </Box>
                      </TableCell>

                      {/* 4. 답변 작성 인라인 폼 */}
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
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 6, color: '#64748b', borderBottom: 'none' }}>
                    해당 날짜({targetDate})의 데이터가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* 3. 페이지네이션 */}
          <TablePagination
            component="div"
            count={allData.length}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[5, 10, 25, 50]}
            labelRowsPerPage="페이지당 항목 수:"
            sx={{ color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.1)' }}
          />
        </TableContainer>
      </Container>
    </Box>
  );
}