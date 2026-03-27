'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// MUI Components
import {
  Box, Card, CardContent, Typography, TextField, Button, 
  CircularProgress, Fade, InputAdornment, Alert
} from '@mui/material';

// Icons
import {
  EmailOutlined as EmailIcon,
  VpnKeyOutlined as KeyIcon,
  Security as SecurityIcon
} from '@mui/icons-material';

export default function LoginPage() {
  const router = useRouter();
  
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  
  const ALLOWED_EMAIL = 'cx@joinandjoin.com';

  
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (email !== ALLOWED_EMAIL) {
      setErrorMsg('인가된 사내 관리자 계정만 접근할 수 있습니다.');
      return;
    }

    setLoading(true);
    
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false, 
      }
    });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setSuccessMsg('메일로 6자리 인증번호가 발송되었습니다. (최대 1~2분 소요)');
      setStep('otp'); 
    }
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    });

    if (error) {
      setErrorMsg('인증번호가 올바르지 않거나 만료되었습니다.');
      setLoading(false);
    } else if (data.session) {
      router.push('/');
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#0f172a', p: 2 }}>
      <Fade in={true} timeout={800}>
        <Card elevation={0} sx={{ 
          maxWidth: 400, width: '100%', 
          bgcolor: 'rgba(30, 41, 59, 0.7)', backdropFilter: 'blur(16px)', 
          border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px' 
        }}>
          <CardContent sx={{ p: 4 }}>
            
            {/* 로고 및 타이틀 영역 */}
            <Box sx={{ textAlign: 'center', mb: 4 }}>
              <Box sx={{ display: 'inline-flex', bgcolor: 'rgba(59, 130, 246, 0.1)', p: 1.5, borderRadius: '50%', mb: 2 }}>
                <SecurityIcon sx={{ fontSize: 32, color: '#3b82f6' }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.5px' }}>
                <span style={{ color: '#3b82f6' }}>N</span>uldam <span style={{ color: '#94a3b8', fontWeight: 300 }}>CX</span>
              </Typography>
            </Box>

            {/* 에러/성공 메시지 알림창 */}
            {errorMsg && <Alert severity="error" sx={{ mb: 3, borderRadius: '8px', fontSize: '0.8rem' }}>{errorMsg}</Alert>}
            {successMsg && <Alert severity="success" sx={{ mb: 3, borderRadius: '8px', fontSize: '0.8rem' }}>{successMsg}</Alert>}

            {/* 폼 영역 (이메일 입력 or 인증번호 입력) */}
            {step === 'email' ? (
              <form onSubmit={handleSendOtp}>
                <TextField
                  fullWidth
                  placeholder="cx@joinandjoin.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailIcon sx={{ color: '#64748b', fontSize: '1.2rem' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ 
                    mb: 3,
                    '& .MuiOutlinedInput-root': { 
                      bgcolor: 'rgba(15, 23, 42, 0.6)', color: '#f8fafc', borderRadius: '8px',
                      '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                      '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
                      '&.Mui-focused fieldset': { borderColor: '#3b82f6' }
                    }
                  }}
                />
                <Button
                  fullWidth
                  type="submit"
                  variant="contained"
                  disabled={loading || !email}
                  sx={{ 
                    py: 1.5, bgcolor: '#3b82f6', color: '#fff', fontWeight: 700, borderRadius: '8px',
                    '&:hover': { bgcolor: '#2563eb' }
                  }}
                >
                  {loading ? <CircularProgress size={24} color="inherit" /> : '인증번호 받기'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp}>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, display: 'block', mb: 1 }}>
                  인증번호 6자리
                </Typography>
                <TextField
                  fullWidth
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))} // 숫자만 입력 가능하게
                  inputProps={{ maxLength: 6, style: { letterSpacing: '8px', textAlign: 'center', fontSize: '1.5rem', fontWeight: 800 } }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <KeyIcon sx={{ color: '#64748b', fontSize: '1.2rem' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ 
                    mb: 3,
                    '& .MuiOutlinedInput-root': { 
                      bgcolor: 'rgba(15, 23, 42, 0.6)', color: '#10b981', borderRadius: '8px',
                      '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                      '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
                      '&.Mui-focused fieldset': { borderColor: '#10b981' }
                    }
                  }}
                />
                <Button
                  fullWidth
                  type="submit"
                  variant="contained"
                  disabled={loading || otp.length !== 6}
                  sx={{ 
                    py: 1.5, bgcolor: '#10b981', color: '#fff', fontWeight: 700, borderRadius: '8px',
                    '&:hover': { bgcolor: '#059669' }
                  }}
                >
                  {loading ? <CircularProgress size={24} color="inherit" /> : '로그인 확인'}
                </Button>
                
                <Button
                  fullWidth
                  variant="text"
                  onClick={() => { setStep('email'); setOtp(''); setErrorMsg(''); }}
                  sx={{ mt: 2, color: '#94a3b8', fontSize: '0.8rem', '&:hover': { color: '#f8fafc' } }}
                >
                  이메일 다시 입력하기
                </Button>
              </form>
            )}

          </CardContent>
        </Card>
      </Fade>
    </Box>
  );
}