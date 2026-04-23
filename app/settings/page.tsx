'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Container, Typography, Stack, Button, Switch, Checkbox,
  Select, MenuItem, TextField, Paper, Divider, FormControlLabel,
  CircularProgress, Alert,
} from '@mui/material';
import {
  Save as SaveIcon,
  Schedule as ScheduleIcon,
  SmartToy as SmartToyIcon,
  HeadsetMic as HeadsetMicIcon,
  TimerOff as TimerOffIcon,
} from '@mui/icons-material';
import HandoffScheduleGrid, { defaultHandoffConfig } from '@/components/settings/HandoffScheduleGrid';
import type { HandoffConfig } from '@/components/settings/HandoffScheduleGrid';

// ─── 타입 ───
interface DaySchedule {
  enabled: boolean;
  allDay: boolean;
  start: string; // "09:00"
  end: string;   // "18:00"
}

interface ScheduleConfig {
  days: Record<string, DaySchedule>; // mon~sun
  holidayEnabled: boolean;
  afterHoursAutoReply: boolean;
  afterHoursMessage: string;
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABELS: Record<string, string> = {
  mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일',
};

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}
TIME_OPTIONS.push('24:00');

const DEFAULT_DAY: DaySchedule = { enabled: true, allDay: false, start: '09:00', end: '18:00' };
const DEFAULT_DAY_OFF: DaySchedule = { enabled: false, allDay: false, start: '09:00', end: '18:00' };

function defaultSchedule(): ScheduleConfig {
  return {
    days: {
      mon: { ...DEFAULT_DAY }, tue: { ...DEFAULT_DAY }, wed: { ...DEFAULT_DAY },
      thu: { ...DEFAULT_DAY }, fri: { ...DEFAULT_DAY },
      sat: { ...DEFAULT_DAY_OFF }, sun: { ...DEFAULT_DAY_OFF },
    },
    holidayEnabled: false,
    afterHoursAutoReply: false,
    afterHoursMessage: '현재 업무시간이 아닙니다. 빠른 시일 내에 답변 드리겠습니다.',
  };
}

const cardBorder = '1px solid rgba(255,255,255,0.08)';
const inputSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: 'rgba(255,255,255,0.04)',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
    '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
  },
  '& .MuiInputBase-input': { color: '#e2e8f0', fontSize: '0.82rem' },
  '& .MuiSelect-icon': { color: '#64748b' },
};

// ─── 요일 스케줄 행 ───
function DayRow({ dayKey, schedule, onChange }: {
  dayKey: string;
  schedule: DaySchedule;
  onChange: (s: DaySchedule) => void;
}) {
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 0.5 }}>
      <Typography sx={{ width: 28, color: schedule.enabled ? '#e2e8f0' : '#475569', fontWeight: 600, fontSize: '0.82rem', textAlign: 'center' }}>
        {DAY_LABELS[dayKey]}
      </Typography>
      <Switch
        size="small"
        checked={schedule.enabled}
        onChange={(_, v) => onChange({ ...schedule, enabled: v })}
        sx={{
          '& .MuiSwitch-switchBase.Mui-checked': { color: '#3b82f6' },
          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#3b82f6' },
        }}
      />
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={schedule.allDay}
            disabled={!schedule.enabled}
            onChange={(_, v) => onChange({ ...schedule, allDay: v })}
            sx={{ color: '#64748b', '&.Mui-checked': { color: '#3b82f6' }, p: 0.3 }}
          />
        }
        label={<Typography variant="caption" sx={{ color: schedule.enabled ? '#94a3b8' : '#475569', fontSize: '0.72rem' }}>24시간</Typography>}
        sx={{ mx: 0 }}
      />
      <Select
        size="small"
        value={schedule.start}
        disabled={!schedule.enabled || schedule.allDay}
        onChange={e => onChange({ ...schedule, start: e.target.value })}
        sx={{ ...inputSx['& .MuiOutlinedInput-root'], minWidth: 90, '& .MuiSelect-select': { py: 0.5, fontSize: '0.78rem', color: '#e2e8f0' }, '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.15)' }, '&.Mui-disabled': { opacity: 0.4 } }}
      >
        {TIME_OPTIONS.filter(t => t !== '24:00').map(t => (
          <MenuItem key={t} value={t} sx={{ fontSize: '0.78rem' }}>{t}</MenuItem>
        ))}
      </Select>
      <Typography sx={{ color: '#475569', fontSize: '0.8rem' }}>~</Typography>
      <Select
        size="small"
        value={schedule.end}
        disabled={!schedule.enabled || schedule.allDay}
        onChange={e => onChange({ ...schedule, end: e.target.value })}
        sx={{ ...inputSx['& .MuiOutlinedInput-root'], minWidth: 90, '& .MuiSelect-select': { py: 0.5, fontSize: '0.78rem', color: '#e2e8f0' }, '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.15)' }, '&.Mui-disabled': { opacity: 0.4 } }}
      >
        {TIME_OPTIONS.filter(t => t > schedule.start).map(t => (
          <MenuItem key={t} value={t} sx={{ fontSize: '0.78rem' }}>{t}</MenuItem>
        ))}
      </Select>
    </Stack>
  );
}

// ─── 스케줄 카드 ───
function ScheduleCard({ title, icon, config, onChange }: {
  title: string;
  icon: React.ReactNode;
  config: ScheduleConfig;
  onChange: (c: ScheduleConfig) => void;
}) {
  const updateDay = (key: string, day: DaySchedule) => {
    onChange({ ...config, days: { ...config.days, [key]: day } });
  };

  return (
    <Box sx={{ border: cardBorder, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.02)', p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        {icon}
        <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: '#e2e8f0' }}>{title}</Typography>
      </Stack>

      {/* 요일별 스케줄 */}
      <Box sx={{ mb: 2 }}>
        {DAY_KEYS.map(key => (
          <DayRow key={key} dayKey={key} schedule={config.days[key]} onChange={s => updateDay(key, s)} />
        ))}
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)', mb: 1.5 }} />

      {/* 공휴일 */}
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={config.holidayEnabled}
            onChange={(_, v) => onChange({ ...config, holidayEnabled: v })}
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': { color: '#3b82f6' },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#3b82f6' },
            }}
          />
        }
        label={<Typography sx={{ color: '#94a3b8', fontSize: '0.82rem' }}>공휴일 응대</Typography>}
      />

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)', my: 1.5 }} />

      {/* 업무시간 외 자동응답 */}
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={config.afterHoursAutoReply}
            onChange={(_, v) => onChange({ ...config, afterHoursAutoReply: v })}
            sx={{ color: '#64748b', '&.Mui-checked': { color: '#3b82f6' } }}
          />
        }
        label={<Typography sx={{ color: '#94a3b8', fontSize: '0.82rem' }}>업무시간 외 자동응답</Typography>}
      />
      {config.afterHoursAutoReply && (
        <TextField
          multiline
          minRows={3}
          maxRows={6}
          fullWidth
          value={config.afterHoursMessage}
          onChange={e => onChange({ ...config, afterHoursMessage: e.target.value })}
          placeholder="업무시간 외 자동 전송 메시지를 입력하세요"
          sx={{ mt: 1, ...inputSx, '& .MuiInputBase-input': { color: '#e2e8f0', fontSize: '0.82rem' } }}
        />
      )}
    </Box>
  );
}

// ─── 메인 페이지 ───
export default function SettingsPage() {
  const [aiSchedule, setAiSchedule] = useState<ScheduleConfig>(defaultSchedule());
  const [humanSchedule, setHumanSchedule] = useState<ScheduleConfig>(defaultSchedule());
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(false);
  const [autoCloseHours, setAutoCloseHours] = useState(360); // 15일 = 360시간
  const [handoffConfig, setHandoffConfig] = useState<HandoffConfig>(defaultHandoffConfig());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 로드
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (data.ai_schedule) setAiSchedule(data.ai_schedule);
        if (data.human_schedule) setHumanSchedule(data.human_schedule);
        if (data.auto_close) {
          setAutoCloseEnabled(data.auto_close.enabled ?? false);
          setAutoCloseHours(data.auto_close.hours ?? 360);
        }
        if (data.handoff_schedule) setHandoffConfig(data.handoff_schedule);
      } catch (e) {
        console.error('설정 로드 실패:', e);
      }
      setLoading(false);
    })();
  }, []);

  // 저장
  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_schedule: aiSchedule,
          human_schedule: humanSchedule,
          auto_close: { enabled: autoCloseEnabled, hours: autoCloseHours },
          handoff_schedule: handoffConfig,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error('설정 저장 실패:', e);
    }
    setSaving(false);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', color: '#f8fafc' }}>
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
          <ScheduleIcon sx={{ color: '#3b82f6', fontSize: 28 }} />
          <Typography variant="h5" fontWeight={700}>상담 설정</Typography>
        </Stack>

        {loading ? (
          <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress size={32} sx={{ color: '#3b82f6' }} /></Box>
        ) : (
          <Stack spacing={3}>
            {/* AI 상담 시간 */}
            <ScheduleCard
              title="AI 상담 시간"
              icon={<SmartToyIcon sx={{ color: '#3b82f6', fontSize: 22 }} />}
              config={aiSchedule}
              onChange={setAiSchedule}
            />

            {/* 휴먼 상담 시간 */}
            <ScheduleCard
              title="휴먼 상담 시간"
              icon={<HeadsetMicIcon sx={{ color: '#8b5cf6', fontSize: 22 }} />}
              config={humanSchedule}
              onChange={setHumanSchedule}
            />

            {/* AI → 휴먼 핸드오프 스케줄 */}
            <HandoffScheduleGrid config={handoffConfig} onChange={setHandoffConfig} />

            {/* 상담 자동 종료 */}
            <Box sx={{ border: cardBorder, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.02)', p: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                <TimerOffIcon sx={{ color: '#f59e0b', fontSize: 22 }} />
                <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: '#e2e8f0' }}>상담 자동 종료</Typography>
              </Stack>
              <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 1.5, lineHeight: 1.5 }}>
                고객의 마지막 메시지로부터 설정된 시간이 지나면 상담을 자동으로 종료합니다. 워크플로우와 별개로 동작합니다.
              </Typography>
              <Stack direction="row" alignItems="center" spacing={2}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={autoCloseEnabled}
                      onChange={(_, v) => setAutoCloseEnabled(v)}
                      sx={{ color: '#64748b', '&.Mui-checked': { color: '#f59e0b' } }}
                    />
                  }
                  label={<Typography sx={{ color: '#94a3b8', fontSize: '0.82rem' }}>자동 종료 활성화</Typography>}
                />
                <TextField
                  type="number"
                  size="small"
                  disabled={!autoCloseEnabled}
                  value={autoCloseHours}
                  onChange={e => {
                    const v = Math.max(1, Math.min(1000, Number(e.target.value) || 1));
                    setAutoCloseHours(v);
                  }}
                  slotProps={{ htmlInput: { min: 1, max: 1000 } }}
                  sx={{
                    width: 100,
                    ...inputSx,
                    '&.Mui-disabled': { opacity: 0.4 },
                  }}
                />
                <Typography sx={{ color: autoCloseEnabled ? '#94a3b8' : '#475569', fontSize: '0.82rem' }}>
                  시간 ({autoCloseEnabled ? `${Math.floor(autoCloseHours / 24)}일 ${autoCloseHours % 24}시간` : '비활성'})
                </Typography>
              </Stack>
            </Box>

            {/* 저장 */}
            <Stack direction="row" alignItems="center" spacing={2}>
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <SaveIcon />}
                disabled={saving}
                onClick={handleSave}
                sx={{
                  bgcolor: '#3b82f6', textTransform: 'none', fontWeight: 600,
                  '&:hover': { bgcolor: '#2563eb' },
                  '&.Mui-disabled': { bgcolor: '#1e3a5f', color: '#64748b' },
                }}
              >
                {saving ? '저장 중...' : '저장'}
              </Button>
              {saved && <Alert severity="success" sx={{ py: 0, bgcolor: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>저장 완료</Alert>}
            </Stack>
          </Stack>
        )}
      </Container>
    </Box>
  );
}
