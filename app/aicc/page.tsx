'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Box, Container, Typography, Card, CardContent, Stack,
  CircularProgress, IconButton, Chip, Button, TextField, Divider,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CircleIcon from '@mui/icons-material/Circle';
import PhoneIcon from '@mui/icons-material/Phone';
import BuildIcon from '@mui/icons-material/Build';
import DescriptionIcon from '@mui/icons-material/Description';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';

interface ServerStatus {
  status: 'online' | 'offline' | 'not_configured' | 'loading';
  service?: string;
  active_calls?: number;
  message?: string;
}

const TOOLS_INFO = [
  {
    name: 'lookup_order',
    label: '주문조회',
    desc: '주문번호 또는 휴대폰번호로 사방넷 주문 조회',
    params: ['order_number', 'phone_number'],
  },
  {
    name: 'track_delivery',
    label: '배송추적',
    desc: '송장번호로 실시간 배송 위치 추적 (CJ대한통운/롯데택배)',
    params: ['tracking_number'],
  },
  {
    name: 'check_hours',
    label: '영업시간',
    desc: '현재 상담 가능 시간 확인 (평일 10:00~17:00)',
    params: [],
  },
  {
    name: 'submit_claim',
    label: '클레임접수',
    desc: '파손/불량/오배송 접수 → 시트 기록 + SMS 사진 링크 발송',
    params: ['order_number', 'product_name', 'claim_type', 'resolution', 'customer_phone', 'mall_name', 'receiver_name', 'receiver_phone', 'receiver_addr', 'tracking_number'],
  },
  {
    name: 'transfer_to_agent',
    label: '상담원 콜백',
    desc: '상담원 콜백 접수 (사유 + 전화번호)',
    params: ['reason', 'customer_phone'],
  },
];

const SYSTEM_PROMPT = `당신은 널담 고객센터 AI 상담원입니다.

## 기본 정보
- 널담은 건강한 먹거리를 판매하는 온라인 쇼핑몰
- 영업시간: 평일 10:00~17:00 (주말·공휴일 휴무)
- 대표번호: 1533-7941

## 응대 원칙
1. 밝고 친절하게 응대
2. 첫 인사: "안녕하세요, 널담 고객센터입니다."
3. 주문번호/송장번호 → lookup_order / track_delivery
4. 주문번호 모르면 → 휴대폰번호로 검색

## 클레임 처리 (사진 증빙 필수)
- 파손/불량/오배송 → 사유 확인 + 재발송/환불 선택 → submit_claim → SMS 사진 링크
- 환불/교환도 동일 절차 (사진 필수)

## 주문취소
- "신규주문"만 취소 가능 → 상담원 콜백
- "주문확인/출고대기" → 취소 불가 안내

## 상담원 콜백
- 사유 + 전화번호 확인 → transfer_to_agent`;

export default function AiccPage() {
  const router = useRouter();
  const [serverStatus, setServerStatus] = useState<ServerStatus>({ status: 'loading' });
  const [lastChecked, setLastChecked] = useState('');
  const [copied, setCopied] = useState(false);

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

  const checkStatus = useCallback(async () => {
    setServerStatus({ status: 'loading' });
    try {
      const res = await fetch('/api/aicc');
      const data = await res.json();
      setServerStatus(data);
    } catch {
      setServerStatus({ status: 'offline', message: '네트워크 오류' });
    }
    setLastChecked(new Date().toLocaleTimeString('ko-KR', { hour12: false }));
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  // 30초마다 자동 새로고침
  useEffect(() => {
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const statusColor = serverStatus.status === 'online' ? '#10b981'
    : serverStatus.status === 'loading' ? '#f59e0b'
    : '#ef4444';

  const statusLabel = serverStatus.status === 'online' ? '정상 운영'
    : serverStatus.status === 'loading' ? '확인 중...'
    : serverStatus.status === 'not_configured' ? 'URL 미설정'
    : '오프라인';

  const handleCopy = () => {
    navigator.clipboard.writeText(SYSTEM_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', color: '#f8fafc' }}>
      <Container maxWidth="xl" sx={{ pt: 3, pb: 8 }}>
        {/* 헤더 */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>AICC 관리</Typography>
            <Chip
              icon={<CircleIcon sx={{ fontSize: '10px !important', color: `${statusColor} !important` }} />}
              label={statusLabel}
              size="small"
              sx={{ bgcolor: `${statusColor}20`, color: statusColor, fontWeight: 600, fontSize: '0.75rem' }}
            />
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1}>
            {lastChecked && (
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                마지막 확인: {lastChecked}
              </Typography>
            )}
            <IconButton onClick={checkStatus} sx={{ color: '#94a3b8' }}>
              <RefreshIcon />
            </IconButton>
          </Stack>
        </Stack>

        {/* 상단 카드 */}
        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          {/* 서버 상태 */}
          <Card sx={{ flex: 1, bgcolor: 'rgba(30,41,59,0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}>
            <CardContent sx={{ p: '20px !important' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <PhoneIcon sx={{ color: '#3b82f6', fontSize: 20 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>서버 상태</Typography>
              </Stack>
              <Stack spacing={1.5}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ color: '#94a3b8' }}>상태</Typography>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <CircleIcon sx={{ fontSize: 8, color: statusColor }} />
                    <Typography variant="body2" sx={{ color: statusColor, fontWeight: 600 }}>{statusLabel}</Typography>
                  </Stack>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ color: '#94a3b8' }}>활성 통화</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#f8fafc' }}>
                    {serverStatus.active_calls ?? '-'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ color: '#94a3b8' }}>서비스</Typography>
                  <Typography variant="body2" sx={{ color: '#64748b' }}>
                    {serverStatus.service || 'N/A'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ color: '#94a3b8' }}>모델</Typography>
                  <Typography variant="body2" sx={{ color: '#64748b', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    gpt-4o-mini-realtime
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {/* 전화번호 */}
          <Card sx={{ flex: 1, bgcolor: 'rgba(30,41,59,0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}>
            <CardContent sx={{ p: '20px !important' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <PhoneIcon sx={{ color: '#10b981', fontSize: 20 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>전화 설정</Typography>
              </Stack>
              <Stack spacing={1.5}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ color: '#94a3b8' }}>대표번호</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>1533-7941</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ color: '#94a3b8' }}>음성</Typography>
                  <Typography variant="body2" sx={{ color: '#64748b' }}>coral (여성)</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ color: '#94a3b8' }}>영업시간</Typography>
                  <Typography variant="body2" sx={{ color: '#64748b' }}>평일 10:00~17:00</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ color: '#94a3b8' }}>SMS 발신번호</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#64748b' }}>1533-7941</Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {/* 처리 흐름 */}
          <Card sx={{ flex: 1, bgcolor: 'rgba(30,41,59,0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}>
            <CardContent sx={{ p: '20px !important' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <DescriptionIcon sx={{ color: '#f59e0b', fontSize: 20 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>처리 흐름</Typography>
              </Stack>
              <Stack spacing={1}>
                {[
                  { step: '1', text: '전화 수신 → AI 인사', color: '#3b82f6' },
                  { step: '2', text: '주문조회 (번호/전화)', color: '#8b5cf6' },
                  { step: '3', text: '클레임 → 사진 SMS 발송', color: '#f59e0b' },
                  { step: '4', text: '취소 → 상태 확인 → 콜백', color: '#ef4444' },
                  { step: '5', text: '기타 → 상담원 콜백 접수', color: '#10b981' },
                ].map((item) => (
                  <Stack key={item.step} direction="row" alignItems="center" spacing={1}>
                    <Box sx={{
                      width: 20, height: 20, borderRadius: '50%', bgcolor: `${item.color}20`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: item.color }}>{item.step}</Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>{item.text}</Typography>
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Stack>

        {/* 도구 목록 */}
        <Card sx={{ bgcolor: 'rgba(30,41,59,0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', mb: 3 }}>
          <Box sx={{ p: 2, px: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 1 }}>
            <BuildIcon sx={{ color: '#8b5cf6', fontSize: 18 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>AI 도구 ({TOOLS_INFO.length}개)</Typography>
          </Box>
          <Box sx={{ p: 2 }}>
            <Stack spacing={1.5}>
              {TOOLS_INFO.map((tool) => (
                <Box
                  key={tool.name}
                  sx={{
                    p: 2, borderRadius: '8px', bgcolor: 'rgba(15,23,42,0.4)',
                    border: '1px solid rgba(255,255,255,0.03)',
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
                    <Chip
                      label={tool.label}
                      size="small"
                      sx={{ bgcolor: 'rgba(139,92,246,0.1)', color: '#a78bfa', fontWeight: 700, height: 24, fontSize: '0.75rem' }}
                    />
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#64748b' }}>
                      {tool.name}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ color: '#94a3b8', fontSize: '0.8rem', mb: 0.5 }}>
                    {tool.desc}
                  </Typography>
                  {tool.params.length > 0 && (
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                      {tool.params.map((p) => (
                        <Chip
                          key={p}
                          label={p}
                          size="small"
                          sx={{ height: 20, fontSize: '0.65rem', fontFamily: 'monospace', bgcolor: 'rgba(255,255,255,0.05)', color: '#64748b' }}
                        />
                      ))}
                    </Stack>
                  )}
                </Box>
              ))}
            </Stack>
          </Box>
        </Card>

        {/* 시스템 프롬프트 */}
        <Card sx={{ bgcolor: 'rgba(30,41,59,0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}>
          <Box sx={{ p: 2, px: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <DescriptionIcon sx={{ color: '#3b82f6', fontSize: 18 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>시스템 프롬프트</Typography>
            </Stack>
            <Button
              size="small"
              startIcon={copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
              onClick={handleCopy}
              sx={{ color: copied ? '#10b981' : '#94a3b8', fontSize: '0.75rem' }}
            >
              {copied ? '복사됨' : '복사'}
            </Button>
          </Box>
          <Box sx={{ p: 2 }}>
            <Box
              sx={{
                p: 2, borderRadius: '8px', bgcolor: 'rgba(0,0,0,0.3)',
                fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.8,
                color: '#94a3b8', whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto',
                '&::-webkit-scrollbar': { width: 6 },
                '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 3 },
              }}
            >
              {SYSTEM_PROMPT}
            </Box>
          </Box>
        </Card>
      </Container>
    </Box>
  );
}
