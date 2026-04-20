'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DropZone from '@/components/voc/DropZone';
import AnalysisResultCard from '@/components/voc/AnalysisResult';
import CsScript from '@/components/voc/CsScript';
import SimilarCases from '@/components/voc/SimilarCases';
import ImportPanel from '@/components/voc/ImportPanel';
import type { AnalysisResult, SimilarCase } from '@/types/voc';

import {
  Box, Container, Typography, Button, Card, CardContent, TextField,
  CircularProgress, Stack, Alert
} from '@mui/material';
import {
  Biotech as BiotechIcon,
  ArrowBack as ArrowBackIcon,
  AutoAwesome as AutoAwesomeIcon,
  Save as SaveIcon,
} from '@mui/icons-material';

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function VocPage() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'>('image/jpeg');
  const [productName, setProductName] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [similarCases, setSimilarCases] = useState<SimilarCase[]>([]);
  const [savedCaseId, setSavedCaseId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [matchedCaseId, setMatchedCaseId] = useState<number | null>(null);

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
  }, [router]);

  const handleFileSelect = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      const mime = file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
      setImageBase64(base64);
      setMimeType(mime);
      setResult(null);
      setSimilarCases([]);
      setSavedCaseId(null);
      setMatchedCaseId(null);
      setSaveMessage(null);
      setError(null);
      setStatus('idle');
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!imageBase64) return;
    setStatus('loading');
    setError(null);
    setResult(null);
    setSimilarCases([]);
    setSavedCaseId(null);
    setMatchedCaseId(null);
    setSaveMessage(null);

    try {
      const res = await fetch('/api/voc/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType, productName: productName.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '분석에 실패했습니다.');
      setResult(json.data);
      setSimilarCases(json.similarCases ?? []);
      setMatchedCaseId(json.matchedCaseId ?? null);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      setStatus('error');
    }
  };

  const handleRegenerate = async (substanceTypeHint: string) => {
    if (!imageBase64) return;
    setRegenerating(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/voc/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType, productName: productName.trim() || undefined, substanceTypeHint }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '재분석 실패');
      setResult(json.data);
      setSimilarCases(json.similarCases ?? []);
      setMatchedCaseId(json.matchedCaseId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '재분석 실패');
    } finally {
      setRegenerating(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const isUpdate = savedCaseId !== null;
      const url = isUpdate ? `/api/voc/cases/${savedCaseId}` : '/api/voc/cases';
      const method = isUpdate ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: productName.trim() || undefined, result, imageBase64: isUpdate ? undefined : imageBase64 }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '저장 실패');
      if (!isUpdate && json.id) setSavedCaseId(json.id);
      setSaveMessage(isUpdate ? '수정 저장 완료' : 'DB에 저장 완료');
    } catch (err) {
      setSaveMessage(`저장 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      setSaving(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: '#3b82f6' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', color: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      {/* 네비게이션은 layout.tsx의 NavBar에서 공통 제공 */}

      {/* 메인 콘텐츠 */}
      <Container maxWidth="md" sx={{ mt: 3, mb: 8, flex: 1, px: { xs: 2, sm: 3 } }}>
        <Stack spacing={2.5}>

          {/* 과거 사례 일괄 등록 */}
          <ImportPanel />

          {/* 업로드 카드 */}
          <Card elevation={0} sx={{
            bgcolor: 'rgba(30, 41, 59, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            backdropFilter: 'blur(10px)'
          }}>
            <CardContent sx={{ p: 3 }}>
              <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc', mb: 2 }}>
                이물질 사진 업로드
              </Typography>

              <DropZone onFileSelect={handleFileSelect} />

              <Box sx={{ mt: 2.5 }}>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', mb: 0.75 }}>
                  제품명 <span style={{ color: '#64748b', fontWeight: 400 }}>(선택)</span>
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="예: 삼다수 2L, 신라면 봉지면 등"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      bgcolor: 'rgba(15, 23, 42, 0.5)',
                      color: '#f8fafc',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                      '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                      '&.Mui-focused fieldset': { borderColor: '#3b82f6' }
                    },
                    '& .MuiInputBase-input::placeholder': { color: '#64748b', opacity: 1 }
                  }}
                />
              </Box>

              <Button
                fullWidth
                onClick={handleAnalyze}
                disabled={!imageBase64 || status === 'loading'}
                startIcon={status === 'loading' ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <AutoAwesomeIcon fontSize="small" />}
                sx={{
                  mt: 2.5, py: 1.3,
                  bgcolor: '#3b82f6',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  borderRadius: '8px',
                  textTransform: 'none',
                  '&:hover': { bgcolor: '#2563eb' },
                  '&.Mui-disabled': { bgcolor: 'rgba(59, 130, 246, 0.2)', color: 'rgba(255,255,255,0.4)' }
                }}
              >
                {status === 'loading' ? 'AI 분석 중...' : 'AI 분석 시작'}
              </Button>
            </CardContent>
          </Card>

          {/* 에러 */}
          {status === 'error' && error && (
            <Alert severity="error" sx={{
              bgcolor: 'rgba(239, 68, 68, 0.1)',
              color: '#fca5a5',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '12px',
              '& .MuiAlert-icon': { color: '#f87171' }
            }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>분석 실패</Typography>
              <Typography sx={{ fontSize: '0.8rem', mt: 0.5 }}>{error}</Typography>
            </Alert>
          )}

          {/* 결과 */}
          {status === 'success' && result && (
            <>
              <AnalysisResultCard
                result={result}
                onChange={setResult}
                onRegenerate={handleRegenerate}
                regenerating={regenerating}
              />
              <SimilarCases cases={similarCases} />
              {matchedCaseId !== null && (
                <Alert
                  severity="info"
                  sx={{
                    bgcolor: 'rgba(59, 130, 246, 0.1)',
                    color: '#93c5fd',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '12px',
                    '& .MuiAlert-icon': { color: '#60a5fa' },
                  }}
                >
                  <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                    🔗 DB 저장 사례의 CS 스크립트를 재사용합니다
                  </Typography>
                  <Typography sx={{ fontSize: '0.8rem', mt: 0.5, color: '#cbd5e1' }}>
                    동일 이물질({result.substanceType})의 기존 사례(ID: {matchedCaseId})가 있어, 일관성을 위해 저장된 스크립트를 그대로 사용합니다. 필요 시 수정해서 저장하면 새 버전으로 덮어써집니다.
                  </Typography>
                </Alert>
              )}
              <CsScript
                script={result.csScript}
                onChange={(s) => {
                  setResult({ ...result, csScript: s });
                  // 수정이 발생하면 "재사용" 배지 해제 — 새 버전이 됨
                  if (matchedCaseId !== null) setMatchedCaseId(null);
                }}
              />

              {/* 저장 카드 */}
              <Card elevation={0} sx={{
                bgcolor: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                backdropFilter: 'blur(10px)'
              }}>
                <CardContent sx={{ p: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                  <Typography sx={{ fontSize: '0.85rem', color: saveMessage ? (saveMessage.includes('실패') ? '#f87171' : '#34d399') : '#94a3b8' }}>
                    {saveMessage
                      ? (saveMessage.includes('실패') ? '❌ ' : '✅ ') + saveMessage
                      : savedCaseId
                        ? `저장됨 (ID: ${savedCaseId}). 수정 후 다시 저장 가능합니다.`
                        : '검토 후 DB에 저장하세요.'}
                  </Typography>
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    startIcon={saving ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <SaveIcon fontSize="small" />}
                    sx={{
                      bgcolor: '#3b82f6',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      px: 2.5, py: 1,
                      borderRadius: '8px',
                      textTransform: 'none',
                      flexShrink: 0,
                      '&:hover': { bgcolor: '#2563eb' },
                      '&.Mui-disabled': { bgcolor: 'rgba(59, 130, 246, 0.2)', color: 'rgba(255,255,255,0.4)' }
                    }}
                  >
                    {saving ? '저장 중...' : savedCaseId ? '수정 저장' : 'DB에 저장'}
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
