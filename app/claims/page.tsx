'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Box, Container, Typography, Card, CardContent,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Stack, CircularProgress, TextField, Select, MenuItem,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';

interface Claim {
  created_at: string;
  claim_id: string;
  mall_name: string;
  order_number: string;
  receiver_name: string;
  receiver_phone: string;
  receiver_addr: string;
  product_name: string;
  tracking_number: string;
  claim_type: string;
  resolution: string;
  photo_urls: string;
  status: string;
  note: string;
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  '접수완료': { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  '사진접수': { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  '처리중': { color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  '처리완료': { color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
};

const getStatusStyle = (status: string) =>
  STATUS_COLORS[status] || { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' };

export default function ClaimsPage() {
  const router = useRouter();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('전체');

  // 사진 모달
  const [photoModal, setPhotoModal] = useState<{ open: boolean; urls: string[]; claimId: string }>({
    open: false, urls: [], claimId: '',
  });

  // 상태 변경
  const [updatingId, setUpdatingId] = useState('');

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const allowedEmails = ['cx@joinandjoin.com', 'ilove2622@nuldam.com'];
      if (!session || !allowedEmails.includes(session?.user?.email || '')) {
        router.replace('/login');
      }
    };
    checkAuth();
  }, [router]);

  const fetchClaims = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/claims');
      const data = await res.json();
      if (data.claims) setClaims(data.claims);
    } catch (e) {
      console.error('클레임 목록 조회 실패:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchClaims(); }, []);

  const updateStatus = async (claimId: string, newStatus: string) => {
    setUpdatingId(claimId);
    try {
      await fetch('/api/claims', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_id: claimId, status: newStatus }),
      });
      setClaims((prev) =>
        prev.map((c) => (c.claim_id === claimId ? { ...c, status: newStatus } : c))
      );
    } catch (e) {
      console.error('상태 업데이트 실패:', e);
    } finally {
      setUpdatingId('');
    }
  };

  const openPhotos = (claim: Claim) => {
    const urls = claim.photo_urls
      ? claim.photo_urls.split('\n').filter((u) => u.trim())
      : [];
    setPhotoModal({ open: true, urls, claimId: claim.claim_id });
  };

  // 필터링
  const filtered = claims.filter((c) => {
    if (filterStatus !== '전체' && c.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.claim_id.toLowerCase().includes(q) ||
        c.order_number.toLowerCase().includes(q) ||
        c.receiver_name.toLowerCase().includes(q) ||
        c.receiver_phone.includes(q) ||
        c.product_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // 통계
  const counts = {
    total: claims.length,
    pending: claims.filter((c) => c.status === '접수완료').length,
    photoReceived: claims.filter((c) => c.status === '사진접수').length,
    done: claims.filter((c) => c.status === '처리완료').length,
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', color: '#f8fafc' }}>
      <Container maxWidth="xl" sx={{ pt: 3, pb: 8 }}>
        {/* 헤더 + 통계 */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            클레임 관리
          </Typography>
          <IconButton onClick={fetchClaims} sx={{ color: '#94a3b8' }}>
            <RefreshIcon />
          </IconButton>
        </Stack>

        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          {[
            { label: '전체', count: counts.total, color: '#94a3b8' },
            { label: '접수완료', count: counts.pending, color: '#f59e0b' },
            { label: '사진접수', count: counts.photoReceived, color: '#3b82f6' },
            { label: '처리완료', count: counts.done, color: '#10b981' },
          ].map((s) => (
            <Card
              key={s.label}
              onClick={() => setFilterStatus(s.label === '전체' ? '전체' : s.label)}
              sx={{
                flex: 1, bgcolor: 'rgba(30,41,59,0.4)', border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '12px', cursor: 'pointer',
                borderColor: filterStatus === s.label ? s.color : 'rgba(255,255,255,0.05)',
                '&:hover': { borderColor: s.color },
              }}
            >
              <CardContent sx={{ p: '16px !important' }}>
                <Typography variant="caption" sx={{ color: '#64748b' }}>{s.label}</Typography>
                <Typography variant="h5" sx={{ color: s.color, fontWeight: 700 }}>{s.count}</Typography>
              </CardContent>
            </Card>
          ))}
        </Stack>

        {/* 검색 + 필터 */}
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <TextField
            size="small"
            placeholder="접수번호 / 주문번호 / 수취인 / 전화번호 / 상품명"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: '#64748b', fontSize: 18 }} />
                </InputAdornment>
              ),
            }}
            sx={{
              flex: 1,
              '& .MuiOutlinedInput-root': {
                bgcolor: 'rgba(15,23,42,0.5)', color: '#f8fafc', borderRadius: '8px', fontSize: '0.85rem',
                '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                '&:hover fieldset': { borderColor: '#3b82f6' },
              },
            }}
          />
          <Select
            size="small"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            sx={{
              minWidth: 120, bgcolor: 'rgba(15,23,42,0.5)', color: '#f8fafc', borderRadius: '8px', fontSize: '0.85rem',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
              '& .MuiSvgIcon-root': { color: '#94a3b8' },
            }}
          >
            <MenuItem value="전체">전체</MenuItem>
            <MenuItem value="접수완료">접수완료</MenuItem>
            <MenuItem value="사진접수">사진접수</MenuItem>
            <MenuItem value="처리중">처리중</MenuItem>
            <MenuItem value="처리완료">처리완료</MenuItem>
          </Select>
        </Stack>

        {/* 테이블 */}
        <Card sx={{ bgcolor: 'rgba(30,41,59,0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress sx={{ color: '#3b82f6' }} />
            </Box>
          ) : (
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 1200 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'rgba(15,23,42,0.6)' }}>
                    {['접수일시', 'Claim ID', '주문사이트', '주문번호', '수취인', '전화번호', '상품명', '송장번호', '유형', '처리요청', '사진', '상태', '비고'].map((h) => (
                      <TableCell
                        key={h}
                        sx={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.75rem', py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.05)', whiteSpace: 'nowrap' }}
                      >
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} align="center" sx={{ py: 6, color: '#64748b', border: 'none' }}>
                        클레임 내역이 없습니다
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((c) => {
                      const hasPhotos = !!c.photo_urls?.trim();
                      const statusStyle = getStatusStyle(c.status);
                      return (
                        <TableRow
                          key={c.claim_id}
                          sx={{
                            '& td': {
                              borderBottom: '1px solid rgba(255,255,255,0.03)', color: '#e2e8f0',
                              fontSize: '0.8rem', py: 1.5, whiteSpace: 'nowrap',
                            },
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
                          }}
                        >
                          <TableCell sx={{ color: '#94a3b8', fontSize: '0.75rem' }}>{c.created_at}</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.75rem' }}>{c.claim_id}</TableCell>
                          <TableCell>{c.mall_name || '-'}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace' }}>{c.order_number}</TableCell>
                          <TableCell>{c.receiver_name || '-'}</TableCell>
                          <TableCell sx={{ fontSize: '0.75rem' }}>{c.receiver_phone || '-'}</TableCell>
                          <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.product_name}>
                            {c.product_name || '-'}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{c.tracking_number || '-'}</TableCell>
                          <TableCell>
                            <Chip label={c.claim_type} size="small" sx={{ bgcolor: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 600, height: 22, fontSize: '0.7rem' }} />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={c.resolution}
                              size="small"
                              sx={{
                                bgcolor: c.resolution === '환불' ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)',
                                color: c.resolution === '환불' ? '#f59e0b' : '#3b82f6',
                                fontWeight: 600, height: 22, fontSize: '0.7rem',
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            {hasPhotos ? (
                              <IconButton size="small" onClick={() => openPhotos(c)} sx={{ color: '#3b82f6' }}>
                                <PhotoCameraIcon fontSize="small" />
                              </IconButton>
                            ) : (
                              <Typography variant="caption" sx={{ color: '#475569' }}>-</Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Select
                              size="small"
                              value={c.status || '접수완료'}
                              disabled={updatingId === c.claim_id}
                              onChange={(e) => updateStatus(c.claim_id, e.target.value)}
                              sx={{
                                height: 28, fontSize: '0.75rem', fontWeight: 600,
                                color: statusStyle.color, bgcolor: statusStyle.bg,
                                borderRadius: '6px',
                                '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                                '& .MuiSvgIcon-root': { color: statusStyle.color, fontSize: 16 },
                              }}
                            >
                              <MenuItem value="접수완료">접수완료</MenuItem>
                              <MenuItem value="사진접수">사진접수</MenuItem>
                              <MenuItem value="처리중">처리중</MenuItem>
                              <MenuItem value="처리완료">처리완료</MenuItem>
                            </Select>
                          </TableCell>
                          <TableCell sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.note}>
                            {c.note || '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Card>
      </Container>

      {/* 사진 모달 */}
      <Dialog
        open={photoModal.open}
        onClose={() => setPhotoModal({ open: false, urls: [], claimId: '' })}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { bgcolor: '#1e293b', color: '#f8fafc', borderRadius: '16px' } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ fontWeight: 700 }}>
            사진 확인 — {photoModal.claimId}
          </Typography>
          <IconButton onClick={() => setPhotoModal({ open: false, urls: [], claimId: '' })} sx={{ color: '#94a3b8' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {photoModal.urls.length === 0 ? (
            <Typography sx={{ color: '#64748b', textAlign: 'center', py: 4 }}>사진이 없습니다</Typography>
          ) : (
            <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 2 }}>
              {photoModal.urls.map((url, i) => (
                <Box key={i} sx={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`사진 ${i + 1}`}
                    style={{ maxWidth: 300, maxHeight: 400, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', objectFit: 'contain' }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => window.open(url, '_blank')}
                    sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' } }}
                  >
                    <OpenInNewIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPhotoModal({ open: false, urls: [], claimId: '' })} sx={{ color: '#94a3b8' }}>
            닫기
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
