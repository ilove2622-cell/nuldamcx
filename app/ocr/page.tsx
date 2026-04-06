'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// MUI Core
import {
  Box, Container, Typography, IconButton, TextField, Button,
  CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Card, CardContent,
  Stack,
  Chip
} from '@mui/material';

// MUI Icons
import {
  ArrowBack as ArrowBackIcon,
  CloudUpload as CloudUploadIcon,
  ContentPaste as ContentPasteIcon,
  DeleteOutline as DeleteOutlineIcon,
} from '@mui/icons-material';

// 🌟 파일 ➡️ Base64 변환 헬퍼 함수
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = error => reject(error);
  });
};

interface HistoryItem {
  timestamp: string;
  mall: string;
  orderNo: string;
  name: string;
  phone: string;
  product: string;
  option: string;
  qty: string;
  tracking: string;
  carrier: string;
  address: string;
  memo: string;
  displayStatus: string;
}

export default function OcrPage() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // 🖼️ 이미지 상태 관리
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [imageBase64, setBase64] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ⚙️ 처리 상태
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [saveStatus, setSaveStatus] = useState({ type: '', msg: '' });

  // 📝 폼 데이터 상태 (오리지널 필드 11개 완벽 복원)
  const [rawText, setRawText] = useState('');
  const [fields, setFields] = useState({
    mall: '', orderNo: '', name: '', phone: '', address: '',
    product: '', option: '', qty: '', tracking: '', carrier: '', memo: ''
  });

  // 📋 내역 상태
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // 🔒 보안: 로그인 확인
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session?.user?.email !== 'cx@joinandjoin.com') {
        router.replace('/login');
      } else {
        setIsCheckingAuth(false);
      }
    };
    checkAuth();
  }, [router]);

  // 📋 이벤트: Ctrl+V (붙여넣기) 감지
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.indexOf('image') === 0) {
          const file = item.getAsFile();
          if (file) await processFile(file);
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // 📁 파일 처리
  const processFile = async (file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setStatus({ type: '', msg: '' });
    try {
      const base64 = await fileToBase64(file);
      setBase64(base64);
    } catch (error) {
      alert('이미지 변환 중 오류가 발생했습니다.');
    }
  };

  // 🖱️ 드래그 앤 드롭
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  // 🗑️ 폼 초기화
  const handleClear = () => {
    setImageFile(null); setImagePreview(''); setBase64('');
    setRawText(''); setStatus({ type: '', msg: '' }); setSaveStatus({ type: '', msg: '' });
    setFields({
      mall: '', orderNo: '', name: '', phone: '', address: '',
      product: '', option: '', qty: '', tracking: '', carrier: '', memo: ''
    });
  };

  // 🚀 API 호출: OCR 텍스트 추출
  const handleExtract = async () => {
    if (!imageBase64) return;
    setIsExtracting(true);
    setStatus({ type: 'processing', msg: '⏳ AI가 이미지를 분석 중이에요...' });
    try {
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64: imageBase64, mimeType: imageFile?.type })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '서버 오류');

      // 원문 및 매핑된 데이터 반영
      setRawText(data.text || '');
      setFields(prev => ({
        ...prev,
        mall: data.mall || prev.mall,
        orderNo: data.orderNumber || prev.orderNo,
        // 현재 API가 이름/전화번호 등을 못 찾았다면 기존 입력값 유지
        name: data.name || prev.name,
        phone: data.phone || prev.phone,
        address: data.address || prev.address,
        product: data.product || prev.product,
        option: data.option || prev.option,
        qty: data.qty || prev.qty,
        tracking: data.tracking || prev.tracking,
        carrier: data.carrier || prev.carrier,
      }));
      setStatus({ type: 'success', msg: '✅ 추출 완료! 내용 확인 후 저장하세요' });
    } catch (error: any) {
      setStatus({ type: 'error', msg: '❌ ' + error.message });
    } finally {
      setIsExtracting(false);
    }
  };

  // 💾 API 호출: 시트 저장
  const handleSave = async () => {
    if (!fields.mall && !fields.orderNo && !fields.name) {
      if (!confirm('입력된 정보가 거의 없습니다. 그래도 저장하시겠습니까?')) return;
    }
    setIsSaving(true);
    setSaveStatus({ type: 'processing', msg: '⏳ 스프레드시트에 저장 중...' });

    const ts = new Date().toLocaleString('ko-KR', { hour12: false });
    const rowData = { ...fields, timestamp: ts };

    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 오리지널 구조의 데이터를 백엔드로 전송
        body: JSON.stringify(rowData)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '저장 실패');

      // 히스토리 상단에 추가
      setHistory(prev => [{ ...rowData, displayStatus: '✅ 저장완료' }, ...prev]);
      setSaveStatus({ type: 'success', msg: '✅ 스프레드시트에 저장됐어요!' });
      
      // 저장 성공 후 입력폼 초기화
      setFields({
        mall: '', orderNo: '', name: '', phone: '', address: '',
        product: '', option: '', qty: '', tracking: '', carrier: '', memo: ''
      });
      
      setTimeout(() => setSaveStatus({ type: '', msg: '' }), 4000);
    } catch (error: any) {
      setSaveStatus({ type: 'error', msg: '❌ ' + error.message });
    } finally {
      setIsSaving(false);
    }
  };

  // CSV 복사 기능
  const copyCSV = () => {
    if (!history.length) return;
    const hdrs = ['저장시각','주문번호','수취인','연락처','주소','상품명','옵션','수량','송장번호','택배사','메모'];
    const rows = history.map(r => [
      r.timestamp, r.orderNo, r.name, r.phone, r.address, r.product, 
      r.option, r.qty, r.tracking, r.carrier, r.memo
    ].map(c => `"${(c || '').replace(/"/g, '""')}"`).join(','));
    navigator.clipboard.writeText([hdrs.join(','), ...rows].join('\n'));
    alert('CSV 복사됐어요! 구글 시트에 붙여넣기 하세요 😊');
  };

  // 공통 입력필드 스타일 (대시보드 테마 적용)
  const inputSx = {
    '& .MuiOutlinedInput-root': { 
      bgcolor: 'rgba(15, 23, 42, 0.5)', color: '#f8fafc', borderRadius: '6px', fontSize: '0.8rem',
      '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
      '&:hover fieldset': { borderColor: '#3b82f6' },
      '&.Mui-focused fieldset': { borderColor: '#3b82f6' }
    }
  };

  // 값 채워짐 여부에 따른 초록색 강조 테마
  const getFilledSx = (val: string) => val ? {
    '& .MuiOutlinedInput-root': { 
      bgcolor: 'rgba(16, 185, 129, 0.05)', color: '#f8fafc', borderRadius: '6px', fontSize: '0.8rem',
      '& fieldset': { borderColor: 'rgba(16, 185, 129, 0.4)' },
    }
  } : inputSx;

  if (isCheckingAuth) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress sx={{ color: '#3b82f6' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', color: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      
      {/* 🌟 헤더 */}
      <Box component="header" sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', bgcolor: 'rgba(15, 23, 42, 0.8)', position: 'sticky', top: 0, zIndex: 50 }}>
        <Container maxWidth="xl" sx={{ py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Link href="/" passHref style={{ textDecoration: 'none' }}>
              <IconButton edge="start" size="small" sx={{ color: '#cbd5e1', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' } }}>
                <ArrowBackIcon fontSize="small" />
              </IconButton>
            </Link>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 28, height: 28, borderRadius: 1.5, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>📋</Box>
              <Box>
                <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.2 }}>널담 OCR 도우미</Typography>
                <Typography sx={{ fontSize: '0.7rem', color: '#94a3b8' }}>사진 → 스프레드시트 자동 입력</Typography>
              </Box>
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ mt: 3, mb: 8, flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
        
        {/* 👉 2단 레이아웃 (왼쪽: 이미지+원본텍스트 / 오른쪽: 11개 입력폼) */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
          
          {/* 🖼️ 왼쪽 패널: 이미지 업로드 및 원본 텍스트 */}
          <Card elevation={0} sx={{ bgcolor: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '12px', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>📸</span> 이미지 업로드
              </Typography>
            </Box>
            <CardContent sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
              
              {!imagePreview ? (
                <Box 
                  onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                  sx={{ 
                    flex: 1, minHeight: '300px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                    border: `2px dashed ${isDragging ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`, borderRadius: '10px',
                    bgcolor: isDragging ? 'rgba(59, 130, 246, 0.05)' : 'transparent', transition: '0.2s', cursor: 'pointer',
                    '&:hover': { borderColor: 'rgba(255,255,255,0.3)', bgcolor: 'rgba(255,255,255,0.02)' }
                  }}
                  onClick={() => document.getElementById('file-upload')?.click()}
                >
                  <input type="file" id="file-upload" accept="image/*" hidden onChange={(e) => e.target.files && processFile(e.target.files[0])} />
                  <Typography sx={{ fontSize: 36, mb: 1 }}>🖼️</Typography>
                  <Typography variant="body2" sx={{ color: '#f8fafc', fontWeight: 600, mb: 0.5 }}>사진을 끌어다 놓거나 클릭해서 선택</Typography>
                  <Typography variant="caption" sx={{ color: '#94a3b8' }}>송장 · 주문내역 · 사방넷 캡처 · JPG, PNG</Typography>
                  <Box sx={{ mt: 2, bgcolor: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', px: 2, py: 0.5, borderRadius: '20px', fontSize: '0.7rem' }}>
                    📋 캡처 후 Ctrl+V 로 바로 붙여넣기 가능
                  </Box>
                </Box>
              ) : (
                <Box sx={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="Preview" style={{ width: '100%', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '320px', objectFit: 'contain', background: '#000' }} />
                  <IconButton 
                    onClick={handleClear} 
                    sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(0,0,0,0.7)', color: '#fff', '&:hover': { bgcolor: '#ef4444' } }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Box>
              )}

              <Button 
                fullWidth variant="contained" 
                disabled={!imageBase64 || isExtracting} onClick={handleExtract}
                sx={{ bgcolor: '#3b82f6', color: '#fff', fontWeight: 600, py: 1.2, '&:hover': { bgcolor: '#2563eb' } }}
              >
                {isExtracting ? '⏳ 분석 중...' : '🔍 OCR 추출 시작'}
              </Button>

              {status.msg && (
                <Box sx={{ 
                  p: 1.5, borderRadius: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 1,
                  bgcolor: status.type === 'error' ? 'rgba(239,68,68,0.1)' : status.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)',
                  color: status.type === 'error' ? '#ef4444' : status.type === 'success' ? '#10b981' : '#60a5fa',
                  border: `1px solid ${status.type === 'error' ? 'rgba(239,68,68,0.3)' : status.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(59,130,246,0.3)'}`
                }}>
                  {status.msg}
                </Box>
              )}

              {/* 오리지널 UI의 특징: 좌측 하단 원본 텍스트 박스 */}
              {rawText && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" sx={{ color: '#94a3b8', mb: 0.5, display: 'block', fontWeight: 600 }}>📄 OCR 원본 텍스트 (파싱 확인용)</Typography>
                  <TextField 
                    fullWidth multiline minRows={4} maxRows={6}
                    value={rawText} InputProps={{ readOnly: true }}
                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#000', color: '#34d399', borderRadius: '8px', fontSize: '0.75rem', fontFamily: 'monospace', p: 1.5 } }} 
                  />
                </Box>
              )}
            </CardContent>
          </Card>

          {/* 📝 오른쪽 패널: 11개 필드 입력폼 */}
          <Card elevation={0} sx={{ bgcolor: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '12px' }}>
            <Box sx={{ p: 2, px: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>📝</span> 추출 결과
              </Typography>
              <Button size="small" onClick={() => setFields({ mall:'', orderNo:'', name:'', phone:'', address:'', product:'', option:'', qty:'', tracking:'', carrier:'', memo:'' })} sx={{ color: '#94a3b8', fontSize: '0.7rem', border: '1px solid rgba(255,255,255,0.1)' }}>초기화</Button>
            </Box>
            
            <CardContent sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                
                {/* 💡 [핵심] 오리지널 Grid 구조 복원 (라벨 고정 넓이) */}
                {[
                  ['쇼핑몰', 'mall', false],
                  ['주문번호', 'orderNo', false],
                  ['수취인', 'name', false],
                  ['연락처', 'phone', false],
                  ['주소', 'address', true],
                  ['상품명', 'product', false],
                  ['옵션', 'option', false],
                  ['수량', 'qty', false],
                  ['송장번호', 'tracking', false],
                  ['택배사', 'carrier', false],
                  ['메모', 'memo', false],
                ].map(([label, key, isMultiline]) => (
                  <Box key={key as string} sx={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 1, alignItems: 'start' }}>
                    <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, pt: 1, letterSpacing: '0.5px' }}>{label}</Typography>
                    <TextField 
                      size="small" fullWidth multiline={isMultiline as boolean} minRows={isMultiline ? 2 : 1}
                      value={fields[key as keyof typeof fields]} 
                      onChange={(e) => setFields(prev => ({ ...prev, [key as string]: e.target.value }))}
                      placeholder={key === 'memo' ? '직접 입력 가능' : '추출 후 자동 입력'}
                      sx={getFilledSx(fields[key as keyof typeof fields])}
                    />
                  </Box>
                ))}

              </Stack>

              <Button 
                fullWidth variant="contained" 
                disabled={isSaving || !Object.values(fields).some(v => v !== '')} onClick={handleSave}
                sx={{ 
                  bgcolor: '#10b981', color: '#fff', fontWeight: 700, py: 1.2, mt: 3, borderRadius: '8px',
                  '&:hover': { bgcolor: '#059669' }, '&.Mui-disabled': { bgcolor: 'rgba(16, 185, 129, 0.3)', color: 'rgba(255,255,255,0.5)' }
                }}
              >
                <span>📊</span> 스프레드시트에 저장
              </Button>

              {saveStatus.msg && (
                <Box sx={{ 
                  mt: 1.5, p: 1.5, borderRadius: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 1,
                  bgcolor: saveStatus.type === 'error' ? 'rgba(239,68,68,0.1)' : saveStatus.type === 'success' ? 'rgba(16,185,129,0.1)' : saveStatus.type === 'warn' ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)',
                  color: saveStatus.type === 'error' ? '#ef4444' : saveStatus.type === 'success' ? '#10b981' : saveStatus.type === 'warn' ? '#f59e0b' : '#60a5fa',
                  border: `1px solid ${saveStatus.type === 'error' ? 'rgba(239,68,68,0.3)' : saveStatus.type === 'success' ? 'rgba(16,185,129,0.3)' : saveStatus.type === 'warn' ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.3)'}`
                }}>
                  {saveStatus.msg}
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* 📜 하단 패널: 13열 히스토리 테이블 완벽 복원 */}
        <Card elevation={0} sx={{ mt: 3, bgcolor: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '12px' }}>
          <Box sx={{ p: 2, px: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 1 }}>
              <span>🗂️</span> 저장 이력
              <Chip label={history.length} size="small" sx={{ bgcolor: '#3b82f6', color: '#fff', height: 20, fontSize: '0.7rem', fontWeight: 700, ml: 1 }} />
            </Typography>
            <Button size="small" onClick={copyCSV} sx={{ color: '#94a3b8', fontSize: '0.7rem', border: '1px solid rgba(255,255,255,0.1)' }}>📋 CSV 복사</Button>
          </Box>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 1000 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'rgba(15,23,42,0.6)' }}>
                  {['#','저장시각','주문번호','수취인','연락처','상품명','옵션','수량','송장번호','택배사','주소','메모','상태'].map(h => (
                    <TableCell key={h} sx={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.7rem', py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.05)', whiteSpace: 'nowrap' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} align="center" sx={{ py: 6, color: '#64748b', border: 'none' }}>📭 저장된 항목이 없어요</TableCell>
                  </TableRow>
                ) : (
                  history.map((row, idx) => (
                    <TableRow key={idx} sx={{ '& td': { borderBottom: '1px solid rgba(255,255,255,0.02)', color: '#e2e8f0', fontSize: '0.75rem', py: 1.5, whiteSpace: 'nowrap', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' } }}>
                      <TableCell sx={{ color: '#64748b' }}>{history.length - idx}</TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontSize: '0.7rem' }}>{row.timestamp}</TableCell>
                      <TableCell>{row.orderNo || '-'}</TableCell>
                      <TableCell>{row.name || '-'}</TableCell>
                      <TableCell>{row.phone || '-'}</TableCell>
                      <TableCell>{row.product || '-'}</TableCell>
                      <TableCell>{row.option || '-'}</TableCell>
                      <TableCell>{row.qty || '-'}</TableCell>
                      <TableCell>{row.tracking || '-'}</TableCell>
                      <TableCell>{row.carrier || '-'}</TableCell>
                      <TableCell title={row.address}>{(row.address || '-').substring(0, 15)}{row.address?.length > 15 ? '…' : ''}</TableCell>
                      <TableCell>{row.memo || '-'}</TableCell>
                      <TableCell>{row.displayStatus}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>

      </Container>
    </Box>
  );
}