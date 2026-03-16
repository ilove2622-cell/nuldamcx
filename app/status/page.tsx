'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase'; // ★ Supabase 연결

// MUI Core
import {
  Box, Container, Typography, Button, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TextField, Chip, IconButton, Fade,
} from '@mui/material';

// MUI Icons
import {
  CloudUpload as CloudUploadIcon,
  ArrowBack as ArrowBackIcon,
  PhoneInTalk as PhoneIcon,
  HeadsetMic as HeadsetIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';

import { DISPLAY_CHANNELS } from '@/lib/constants';
import { normalizeSiteName } from '@/lib/siteMapper';

interface ChannelStat {
  name: string;
  count: number;
  issue: string;
}

// 엑셀 날짜 정규화 함수 (DB 저장용 YYYY-MM-DD 변환)
function normalizeExcelDate(excelVal: any): string {
  if (!excelVal) return '';
  if (typeof excelVal === 'number') {
    const date = new Date(Math.floor(excelVal - 25569) * 86400 * 1000);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  let str = String(excelVal).trim();
  if (str.includes(' ')) str = str.split(' ')[0];
  if (str.includes('T')) str = str.split('T')[0];
  str = str.replace(/\./g, '-').replace(/\//g, '-');
  const parts = str.split('-');
  if (parts.length === 3) {
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }
  return str;
}

export default function StatusPage() {
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [stats, setStats] = useState<ChannelStat[]>(
    DISPLAY_CHANNELS.map(name => ({ name, count: 0, issue: '' }))
  );
  const [callStats, setCallStats] = useState({ inflow: 0, response: 0 });
  const [isUploading, setIsUploading] = useState(false);

  // ★ DB에서 현황(개수) 불러오기 함수
  const fetchStats = async (dateStr: string) => {
    const { data, error } = await supabase
      .from('inquiries')
      .select('channel')
      .eq('inquiry_date', dateStr);

    if (error) {
      console.error('데이터 불러오기 실패:', error);
      return;
    }

    // 채널별 개수 집계
    const counts: Record<string, number> = {};
    if (data) {
      data.forEach(row => {
        counts[row.channel] = (counts[row.channel] || 0) + 1;
      });
    }

    // UI 상태 업데이트
    setStats(prev => prev.map(item => ({
      ...item,
      count: counts[item.name] || 0
    })));
  };

  // 날짜가 바뀔 때마다 DB 조회하여 건수 갱신
  useEffect(() => {
    fetchStats(targetDate);
  }, [targetDate]);

  // ★ 엑셀 업로드 및 DB 저장 로직
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        let headerRowIndex = -1;
        const colIndices = { mall: -1, date: -1, order: -1, name: -1, content: -1 };

        const exactMallHeaders = ['쇼핑몰', '판매처', '사이트', '채널명']; 
        const exactDateHeaders = ['고객등록일자', '등록일', '주문일자', '날짜', '접수일'];
        const fuzzyHeaders = {
          order: ['주문번호', '결제번호', '상품주문번호'],
          name: ['주문자명', '구매자명', '수취인명', '성함', '고객명'],
          content: ['문의내용', '상담내용', '내용']
        };

        for (let i = 0; i < Math.min(rawData.length, 20); i++) {
          const row = rawData[i];
          for (let j = 0; j < row.length; j++) {
            const cellValue = String(row[j] || '').trim().replace(/\s/g, '');

            if (exactMallHeaders.includes(cellValue)) colIndices.mall = j;
            if (exactDateHeaders.includes(cellValue)) colIndices.date = j;
            if (colIndices.order === -1 && fuzzyHeaders.order.some(h => cellValue.includes(h))) colIndices.order = j;
            if (colIndices.name === -1 && fuzzyHeaders.name.some(h => cellValue.includes(h))) colIndices.name = j;
            if (colIndices.content === -1 && fuzzyHeaders.content.some(h => cellValue.includes(h))) colIndices.content = j;
          }
          if (colIndices.mall !== -1 && colIndices.date !== -1) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1 || colIndices.mall === -1 || colIndices.date === -1) {
          alert("오류: 엑셀에서 필수 열(쇼핑몰, 고객등록일자)을 찾을 수 없습니다.");
          setIsUploading(false);
          return;
        }

        // DB에 넣을 데이터 배열 만들기
        const insertData = [];

        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
          const row = rawData[i];
          const rawSiteName = row[colIndices.mall];
          const rawDate = row[colIndices.date]; 

          if (!rawSiteName || !rawDate) continue;

          const normalizedDate = normalizeExcelDate(rawDate);
          
          // 현재 선택된 날짜의 데이터만 업로드 (원하시면 제거하여 전체 업로드도 가능)
          if (normalizedDate !== targetDate) continue; 

          insertData.push({
            channel: normalizeSiteName(String(rawSiteName)),
            inquiry_date: normalizedDate,
            order_number: colIndices.order !== -1 ? String(row[colIndices.order] || '-') : '-',
            customer_name: colIndices.name !== -1 ? String(row[colIndices.name] || '-') : '-',
            content: colIndices.content !== -1 ? String(row[colIndices.content] || '내용 없음') : '내용 없음',
            status: '신규' // ★ 초기 상태는 무조건 '신규'
          });
        }

        if (insertData.length === 0) {
          alert(`해당 날짜(${targetDate})의 데이터가 엑셀에 없습니다.`);
          setIsUploading(false);
          return;
        }

        // ★ Supabase DB에 일괄 삽입(Insert)
        const { error } = await supabase.from('inquiries').insert(insertData);

        if (error) {
          console.error("DB 저장 오류:", error);
          alert("데이터를 DB에 저장하는 중 오류가 발생했습니다.");
        } else {
          alert(`✅ ${insertData.length}건의 문의가 성공적으로 수집(저장)되었습니다!`);
          // 업로드 성공 후 현황 다시 불러오기
          fetchStats(targetDate);
        }

      } catch (error) {
        console.error("오류:", error);
        alert("처리 중 오류가 발생했습니다.");
      } finally {
        setIsUploading(false);
        // input 초기화 (같은 파일 다시 올릴 수 있게)
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleStatChange = (index: number, field: 'count' | 'issue', value: string | number) => {
    const newStats = [...stats];
    newStats[index] = { ...newStats[index], [field]: value };
    setStats(newStats);
  };

  const totalCount = stats.reduce((acc, cur) => acc + cur.count, 0);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'transparent', color: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      
      {/* 1. 상단 네비게이션 */}
      <Box component="header" sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', bgcolor: 'rgba(15, 23, 42, 0.6)', position: 'sticky', top: 0, zIndex: 50 }}>
        <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Link href="/" passHref style={{ textDecoration: 'none' }}>
              <IconButton edge="start" sx={{ color: '#cbd5e1', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' } }}>
                <ArrowBackIcon />
              </IconButton>
            </Link>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#f8fafc' }}>
                📋 현황 관리 및 업로드
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                날짜를 선택하고 엑셀 파일을 업로드하여 데이터를 집계하세요.
              </Typography>
            </Box>
            
            <TextField
              type="date"
              size="small"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              sx={{ 
                ml: 3, width: 150, bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 1,
                input: { color: '#fff', fontSize: '0.9rem', fontWeight: 'bold' },
                colorScheme: 'dark'
              }}
            />
          </Box>

          <Box>
            <input
              accept=".xlsx, .xls"
              style={{ display: 'none' }}
              id="excel-upload-button"
              type="file"
              onChange={handleFileUpload}
              disabled={isUploading}
            />
            <label htmlFor="excel-upload-button">
              <Button
                variant="contained"
                component="span"
                startIcon={<CloudUploadIcon />}
                disableElevation
                disabled={isUploading}
                sx={{ 
                  bgcolor: '#3b82f6', color: '#fff', fontWeight: 600, textTransform: 'none', borderRadius: '12px', px: 3,
                  boxShadow: '0 4px 14px 0 rgba(59, 130, 246, 0.39)',
                  '&:hover': { bgcolor: '#2563eb', boxShadow: '0 6px 20px rgba(59, 130, 246, 0.23)' },
                  '&.Mui-disabled': { bgcolor: '#475569', color: '#94a3b8' }
                }}
              >
                {isUploading ? '업로드 중...' : '새로운 문의 수집 (엑셀)'}
              </Button>
            </label>
          </Box>
        </Container>
      </Box>

      {/* 2. 메인 컨텐츠 영역 */}
      <Container maxWidth="lg" sx={{ mt: 6, mb: 8, flex: 1 }}>
        <Fade in={true} timeout={800}>
          <Box>
            
            {/* KPI 카드 2개 */}
            <Grid container spacing={4} sx={{ mb: 6 }}>
              {/* 유입호 */}
              <Grid item xs={12} md={6}>
                <Card elevation={0} sx={{ bgcolor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '20px', backdropFilter: 'blur(10px)' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 4 }}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: '#94a3b8' }}>
                        📞 총 유입호 (Inflow)
                      </Typography>
                      <TextField
                        variant="standard"
                        value={callStats.inflow}
                        type="number"
                        onChange={(e) => setCallStats({...callStats, inflow: Number(e.target.value)})}
                        InputProps={{ disableUnderline: true, style: { fontSize: '2.5rem', fontWeight: 800, color: '#3b82f6' } }}
                        sx={{ width: '150px' }}
                      />
                    </Box>
                    <Box sx={{ bgcolor: 'rgba(59, 130, 246, 0.1)', p: 2, borderRadius: '16px', color: '#3b82f6' }}>
                      <PhoneIcon sx={{ fontSize: 40 }} />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              {/* 응대콜 */}
              <Grid item xs={12} md={6}>
                <Card elevation={0} sx={{ bgcolor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '20px', backdropFilter: 'blur(10px)' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 4 }}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: '#94a3b8' }}>
                        🗣️ 총 응대콜 (Response)
                      </Typography>
                      <TextField
                        variant="standard"
                        value={callStats.response}
                        type="number"
                        onChange={(e) => setCallStats({...callStats, response: Number(e.target.value)})}
                        InputProps={{ disableUnderline: true, style: { fontSize: '2.5rem', fontWeight: 800, color: '#10b981' } }}
                        sx={{ width: '150px' }}
                      />
                    </Box>
                    <Box sx={{ bgcolor: 'rgba(16, 185, 129, 0.1)', p: 2, borderRadius: '16px', color: '#10b981' }}>
                      <HeadsetIcon sx={{ fontSize: 40 }} />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* 3. 사이트별 처리 현황 테이블 */}
            <TableContainer component={Paper} elevation={0} sx={{ bgcolor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '20px' }}>
              <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#f8fafc' }}>
                  사이트별 데이터베이스 현황 <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 'normal' }}>({targetDate})</span>
                </Typography>
                <Chip label={`DB 저장 완료: ${totalCount}건`} color="primary" variant="outlined" sx={{ fontWeight: 700, color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.5)' }} />
              </Box>
              
              <Table sx={{ minWidth: 650 }}>
                <TableHead sx={{ bgcolor: 'rgba(15, 23, 42, 0.8)' }}>
                  <TableRow>
                    <TableCell width="30%" sx={{ fontWeight: 600, color: '#94a3b8' }}>채널 (Channel)</TableCell>
                    <TableCell width="20%" align="center" sx={{ fontWeight: 600, color: '#94a3b8' }}>수집된 문의 건수</TableCell>
                    <TableCell width="50%" sx={{ fontWeight: 600, color: '#94a3b8' }}>이슈 사항 (Comment)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.map((stat, index) => (
                    <TableRow key={stat.name} hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' }, '&:last-child td, &:last-child th': { border: 0 }, transition: '0.2s', borderColor: 'rgba(255,255,255,0.05)' }}>
                      <TableCell component="th" scope="row" sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Link href={`/channels`} style={{ textDecoration: 'none', color: 'inherit' }}>
                            <Typography variant="body1" sx={{ fontWeight: 600, color: '#f8fafc', cursor: 'pointer', '&:hover': { color: '#3b82f6' } }}>
                              {stat.name}
                            </Typography>
                          </Link>
                          {stat.name === '기타' && <Chip label="ETC" size="small" sx={{ fontSize: '0.65rem', height: 20, bgcolor: 'rgba(255,255,255,0.1)', color: '#94a3b8' }} />}
                          {stat.count > 0 && (
                            <Link href={`/channels`}><OpenInNewIcon sx={{ fontSize: 16, color: '#64748b', '&:hover': { color: '#3b82f6' } }} /></Link>
                          )}
                        </Box>
                      </TableCell>

                      <TableCell align="center" sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <Typography variant="h6" sx={{ fontWeight: stat.count > 0 ? 800 : 500, color: stat.count > 0 ? '#3b82f6' : '#64748b' }}>
                          {stat.count}
                        </Typography>
                      </TableCell>

                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <TextField
                          fullWidth variant="outlined" size="small" placeholder="특이사항 입력 (선택)"
                          value={stat.issue} onChange={(e) => handleStatChange(index, 'issue', e.target.value)}
                          sx={{ 
                            '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: 'rgba(15, 23, 42, 0.5)', color: '#cbd5e1', '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' }, '&.Mui-focused fieldset': { borderColor: '#3b82f6' } },
                            '& .MuiInputBase-input::placeholder': { color: '#64748b', opacity: 1 }
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  <TableRow sx={{ bgcolor: 'rgba(15, 23, 42, 0.8)' }}>
                    <TableCell sx={{ fontWeight: 700, fontSize: '1rem', color: '#cbd5e1', borderColor: 'transparent' }}>총 합계</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#3b82f6', borderColor: 'transparent' }}>
                      {totalCount}
                    </TableCell>
                    <TableCell sx={{ borderColor: 'transparent' }} />
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>

          </Box>
        </Fade>
      </Container>
    </Box>
  );
}