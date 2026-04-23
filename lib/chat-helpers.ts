import type { MessageBlock } from '@/types/chat';
import { emojifyText } from '@/lib/emoji-utils';

// ─── 채널 ───
export const channelLabel = (type: string) => {
  if (type === 'appKakao') return '카카오톡';
  if (type === 'appNaverTalk') return '네이버톡톡';
  return '채널톡';
};

export const channelColor = (type: string) => {
  if (type === 'appKakao') return '#fee500';
  if (type === 'appNaverTalk') return '#03c75a';
  return '#3b82f6';
};

// ─── 상태 ───
export const statusLabel = (status: string) => {
  if (status === 'open') return '신규';
  if (status === 'escalated') return '진행중';
  if (status === 'closed') return '완료';
  return status;
};

export const statusColor = (status: string) => {
  if (status === 'open') return '#3b82f6';
  if (status === 'escalated') return '#ef4444';
  if (status === 'closed') return '#10b981';
  return '#64748b';
};

// ─── 신뢰도 ───
export const confidenceColor = (c: number) => {
  if (c >= 0.8) return '#10b981';
  if (c >= 0.5) return '#f59e0b';
  return '#ef4444';
};

// ─── 시간 ───
export function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const toKSTDate = (t: Date) => new Date(t.getTime() + kstOffset).toISOString().slice(0, 10);
  const today = toKSTDate(now);
  const dateKST = toKSTDate(d);
  const yesterday = toKSTDate(new Date(now.getTime() - 86400000));

  if (dateKST === today) {
    const h = String(d.getUTCHours() + 9).padStart(2, '0');
    const hNum = Number(h) >= 24 ? Number(h) - 24 : Number(h);
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    return `${String(hNum).padStart(2, '0')}:${m}`;
  }
  if (dateKST === yesterday) return '어제';
  return `${dateKST.slice(5, 7)}/${dateKST.slice(8, 10)}`;
}

// ─── 별표 관리 ───
export function getStarredSessions(): Set<number> {
  try {
    const raw = localStorage.getItem('starred_sessions');
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

export function toggleStarred(id: number): Set<number> {
  const starred = getStarredSessions();
  if (starred.has(id)) starred.delete(id);
  else starred.add(id);
  localStorage.setItem('starred_sessions', JSON.stringify([...starred]));
  return new Set(starred);
}

// ─── 메시지 블록 파싱 (Phase 3.6) ───
export function parseMessageBlocks(text: string): MessageBlock[] {
  const lines = emojifyText(text).split('\n');
  const blocks: MessageBlock[] = [];
  let textBuf: string[] = [];

  const flushText = () => {
    if (textBuf.length > 0) {
      blocks.push({ type: 'text', content: textBuf.join('\n') });
      textBuf = [];
    }
  };

  for (const line of lines) {
    // [image:URL]
    const imgMatch = line.match(/^\[image:(https?:\/\/.+)\]$/);
    if (imgMatch) { flushText(); blocks.push({ type: 'image', url: imgMatch[1] }); continue; }

    // [photo:chatId:fileId:dims:name]
    const photoMatch = line.match(/^\[photo:([^:]*):([^:]*):([^:]*):([^\]]*)\]$/);
    if (photoMatch) { flushText(); blocks.push({ type: 'photo', chatId: photoMatch[1], fileId: photoMatch[2], dims: photoMatch[3], name: photoMatch[4] }); continue; }

    // [video-url:URL]
    const videoUrlMatch = line.match(/^\[video-url:(https?:\/\/.+)\]$/);
    if (videoUrlMatch) { flushText(); blocks.push({ type: 'video-url', url: videoUrlMatch[1] }); continue; }

    // [video:chatId:fileId:dur:name]
    const videoMatch = line.match(/^\[video:([^:]*):([^:]*):([^:]*):([^\]]*)\]$/);
    if (videoMatch) { flushText(); blocks.push({ type: 'video', chatId: videoMatch[1], fileId: videoMatch[2], duration: videoMatch[3], name: videoMatch[4] }); continue; }

    // [file:chatId:fileId:size:name]
    const fileMatch = line.match(/^\[file:([^:]*):([^:]*):([^:]*):([^\]]*)\]$/);
    if (fileMatch) { flushText(); blocks.push({ type: 'file', chatId: fileMatch[1], fileId: fileMatch[2], size: fileMatch[3], name: fileMatch[4] }); continue; }

    textBuf.push(line);
  }
  flushText();
  return blocks;
}

// ─── UUID 생성 (멱등성 키) ───
export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback
  return 'xxxx-xxxx-4xxx-yxxx-xxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
