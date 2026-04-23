'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  Box, Typography, Stack, Select, MenuItem, IconButton, Tooltip, Popover, List, ListItemButton, ListItemText,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  SwapHoriz as SwapIcon,
} from '@mui/icons-material';

// ─── 타입 ───
// grid[day][hour] = true → AI 처리, false → 휴먼 핸드오프
export interface HandoffConfig {
  grid: boolean[][]; // [7][24] — 0=일, 1=월 ... 6=토
  timezone: string;
  defaultAgent: string;
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const TIMEZONES = [
  'Asia/Seoul',
  'Asia/Tokyo',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'UTC',
];

const AGENTS = [
  { value: 'auto', label: '자동 배정' },
  { value: 'manager_1', label: '담당자 1' },
  { value: 'manager_2', label: '담당자 2' },
  { value: 'manager_3', label: '담당자 3' },
];

export function defaultHandoffConfig(): HandoffConfig {
  // 기본: 평일 09~18 AI, 나머지 휴먼
  const grid: boolean[][] = [];
  for (let d = 0; d < 7; d++) {
    const row: boolean[] = [];
    for (let h = 0; h < 24; h++) {
      // 월~금(1~5), 9~17시 AI
      row.push(d >= 1 && d <= 5 && h >= 9 && h <= 17);
    }
    grid.push(row);
  }
  return { grid, timezone: 'Asia/Seoul', defaultAgent: 'auto' };
}

const cardBorder = '1px solid rgba(255,255,255,0.08)';
const CELL_W = 32;
const CELL_H = 22;

interface Props {
  config: HandoffConfig;
  onChange: (c: HandoffConfig) => void;
}

export default function HandoffScheduleGrid({ config, onChange }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);

  // 드래그 상태
  const [dragging, setDragging] = useState(false);
  const [paintValue, setPaintValue] = useState(true); // 드래그 시 칠할 값
  const dragStartRef = useRef<{ day: number; hour: number } | null>(null);

  // 복사 팝오버
  const [copyAnchor, setCopyAnchor] = useState<HTMLElement | null>(null);
  const [copyFromDay, setCopyFromDay] = useState(0);

  const setCell = useCallback((day: number, hour: number, value: boolean) => {
    const newGrid = config.grid.map(r => [...r]);
    newGrid[day][hour] = value;
    onChange({ ...config, grid: newGrid });
  }, [config, onChange]);

  const setCells = useCallback((cells: Array<[number, number]>, value: boolean) => {
    const newGrid = config.grid.map(r => [...r]);
    for (const [d, h] of cells) newGrid[d][h] = value;
    onChange({ ...config, grid: newGrid });
  }, [config, onChange]);

  // 마우스 드래그
  const getCellFromEvent = (e: React.MouseEvent): { day: number; hour: number } | null => {
    if (!gridRef.current) return null;
    const rect = gridRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const day = Math.floor(x / CELL_W);
    const hour = Math.floor(y / CELL_H);
    if (day < 0 || day > 6 || hour < 0 || hour > 23) return null;
    return { day, hour };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const cell = getCellFromEvent(e);
    if (!cell) return;
    e.preventDefault();
    const newVal = !config.grid[cell.day][cell.hour];
    setPaintValue(newVal);
    setDragging(true);
    dragStartRef.current = cell;
    setCell(cell.day, cell.hour, newVal);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const cell = getCellFromEvent(e);
    if (!cell) return;
    // 범위 선택: startRef → current
    const start = dragStartRef.current;
    if (!start) return;
    const minD = Math.min(start.day, cell.day);
    const maxD = Math.max(start.day, cell.day);
    const minH = Math.min(start.hour, cell.hour);
    const maxH = Math.max(start.hour, cell.hour);
    const cells: Array<[number, number]> = [];
    for (let d = minD; d <= maxD; d++) {
      for (let h = minH; h <= maxH; h++) {
        cells.push([d, h]);
      }
    }
    setCells(cells, paintValue);
  };

  const handleMouseUp = () => {
    setDragging(false);
    dragStartRef.current = null;
  };

  // 복사
  const handleCopyClick = (e: React.MouseEvent<HTMLElement>, dayIdx: number) => {
    setCopyFromDay(dayIdx);
    setCopyAnchor(e.currentTarget);
  };

  const handleCopyTo = (targetDay: number) => {
    const newGrid = config.grid.map(r => [...r]);
    newGrid[targetDay] = [...newGrid[copyFromDay]];
    onChange({ ...config, grid: newGrid });
    setCopyAnchor(null);
  };

  const aiCount = config.grid.flat().filter(Boolean).length;
  const humanCount = 7 * 24 - aiCount;

  return (
    <Box sx={{ border: cardBorder, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.02)', p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <SwapIcon sx={{ color: '#10b981', fontSize: 22 }} />
        <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: '#e2e8f0' }}>AI → 휴먼 핸드오프 스케줄</Typography>
      </Stack>

      <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 2, lineHeight: 1.5 }}>
        마우스 드래그로 시간 블록을 선택/해제합니다. 파란색 = AI 처리, 빈칸 = 기본 담당자에게 핸드오프.
      </Typography>

      {/* 상단 드롭다운 */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Stack spacing={0.5}>
          <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.7rem' }}>타임존</Typography>
          <Select
            size="small"
            value={config.timezone}
            onChange={e => onChange({ ...config, timezone: e.target.value })}
            sx={{
              minWidth: 170, bgcolor: 'rgba(255,255,255,0.04)',
              '& .MuiSelect-select': { py: 0.5, fontSize: '0.78rem', color: '#e2e8f0' },
              '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
              '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
              '& .MuiSelect-icon': { color: '#64748b' },
            }}
          >
            {TIMEZONES.map(tz => (
              <MenuItem key={tz} value={tz} sx={{ fontSize: '0.78rem' }}>{tz}</MenuItem>
            ))}
          </Select>
        </Stack>
        <Stack spacing={0.5}>
          <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.7rem' }}>기본 담당자</Typography>
          <Select
            size="small"
            value={config.defaultAgent}
            onChange={e => onChange({ ...config, defaultAgent: e.target.value })}
            sx={{
              minWidth: 150, bgcolor: 'rgba(255,255,255,0.04)',
              '& .MuiSelect-select': { py: 0.5, fontSize: '0.78rem', color: '#e2e8f0' },
              '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
              '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
              '& .MuiSelect-icon': { color: '#64748b' },
            }}
          >
            {AGENTS.map(a => (
              <MenuItem key={a.value} value={a.value} sx={{ fontSize: '0.78rem' }}>{a.label}</MenuItem>
            ))}
          </Select>
        </Stack>
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" spacing={1.5} alignItems="flex-end" sx={{ pb: 0.3 }}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: '#3b82f6' }} />
            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.68rem' }}>AI ({aiCount}h)</Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }} />
            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.68rem' }}>휴먼 ({humanCount}h)</Typography>
          </Stack>
        </Stack>
      </Stack>

      {/* 격자 */}
      <Box sx={{ overflowX: 'auto' }}>
        <Box sx={{ display: 'inline-block' }}>
          {/* 요일 헤더 + 복사 버튼 */}
          <Stack direction="row" sx={{ ml: `${36}px` }}>
            {DAYS.map((day, di) => (
              <Box key={di} sx={{ width: CELL_W, textAlign: 'center' }}>
                <Typography sx={{ fontSize: '0.68rem', color: di === 0 ? '#ef4444' : di === 6 ? '#3b82f6' : '#94a3b8', fontWeight: 600, lineHeight: 1 }}>
                  {day}
                </Typography>
                <Tooltip title={`${day}요일 복사`} placement="top">
                  <IconButton
                    size="small"
                    onClick={(e) => handleCopyClick(e, di)}
                    sx={{ p: 0.1, color: '#475569', '&:hover': { color: '#94a3b8' } }}
                  >
                    <CopyIcon sx={{ fontSize: 11 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
          </Stack>

          {/* 시간 라벨 + 셀 격자 */}
          <Box
            sx={{ display: 'flex', userSelect: 'none' }}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* 시간 라벨 */}
            <Box sx={{ width: 36, flexShrink: 0 }}>
              {HOURS.map(h => (
                <Box key={h} sx={{ height: CELL_H, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', pr: 0.5 }}>
                  <Typography sx={{ fontSize: '0.6rem', color: '#475569', fontFamily: 'monospace' }}>
                    {String(h).padStart(2, '0')}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* 셀 격자 */}
            <Box
              ref={gridRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(7, ${CELL_W}px)`,
                gridTemplateRows: `repeat(24, ${CELL_H}px)`,
                gap: '1px',
                bgcolor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 1,
                cursor: 'crosshair',
              }}
            >
              {HOURS.map(h =>
                DAYS.map((_, di) => {
                  const active = config.grid[di]?.[h] ?? false;
                  return (
                    <Tooltip
                      key={`${di}-${h}`}
                      title={`${DAYS[di]} ${String(h).padStart(2, '0')}:00 — ${active ? 'AI 처리' : '휴먼 핸드오프'}`}
                      placement="top"
                      enterDelay={300}
                    >
                      <Box
                        sx={{
                          width: CELL_W,
                          height: CELL_H,
                          bgcolor: active ? 'rgba(59,130,246,0.55)' : 'rgba(255,255,255,0.02)',
                          transition: 'background-color 0.05s',
                          '&:hover': {
                            bgcolor: active ? 'rgba(59,130,246,0.75)' : 'rgba(255,255,255,0.08)',
                          },
                        }}
                      />
                    </Tooltip>
                  );
                })
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* 복사 팝오버 */}
      <Popover
        open={!!copyAnchor}
        anchorEl={copyAnchor}
        onClose={() => setCopyAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{ paper: { sx: { bgcolor: '#1e293b', border: cardBorder, borderRadius: 1.5, minWidth: 120 } } }}
      >
        <Typography variant="caption" sx={{ px: 1.5, pt: 1, pb: 0.5, display: 'block', color: '#64748b', fontSize: '0.68rem' }}>
          {DAYS[copyFromDay]}요일 → 복사 대상:
        </Typography>
        <List dense sx={{ py: 0.5 }}>
          {DAYS.map((day, di) => {
            if (di === copyFromDay) return null;
            return (
              <ListItemButton
                key={di}
                onClick={() => handleCopyTo(di)}
                sx={{ py: 0.3, '&:hover': { bgcolor: 'rgba(59,130,246,0.1)' } }}
              >
                <ListItemText
                  primary={`${day}요일`}
                  slotProps={{ primary: { sx: { fontSize: '0.78rem', color: '#e2e8f0' } } }}
                />
              </ListItemButton>
            );
          })}
          <ListItemButton
            onClick={() => {
              const newGrid = config.grid.map(r => [...r]);
              for (let d = 0; d < 7; d++) {
                if (d !== copyFromDay) newGrid[d] = [...newGrid[copyFromDay]];
              }
              onChange({ ...config, grid: newGrid });
              setCopyAnchor(null);
            }}
            sx={{ py: 0.3, borderTop: '1px solid rgba(255,255,255,0.06)', '&:hover': { bgcolor: 'rgba(59,130,246,0.1)' } }}
          >
            <ListItemText
              primary="전체 요일에 적용"
              slotProps={{ primary: { sx: { fontSize: '0.78rem', color: '#60a5fa', fontWeight: 600 } } }}
            />
          </ListItemButton>
        </List>
      </Popover>
    </Box>
  );
}
