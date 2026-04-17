import { unassignFromBot, addTag, addNote } from './channeltalk-client';
import type { Category } from './llm-router';

/** 무조건 에스컬레이션 카테고리 */
const FORCE_ESCALATE_CATEGORIES: Category[] = ['환불', '교환', '취소', '클레임'];

/** 무조건 에스컬레이션 키워드 (메시지 내용 기반) */
const FORCE_ESCALATE_KEYWORDS = [
  '환불', '교환', '취소', '반품',
  '파손', '오배송', '불량', '깨졌', '깨진', '잘못',
  '클레임', '항의', '신고',
];

/** 카테고리 기반 무조건 에스컬레이션 여부 */
export function shouldForceEscalate(category: Category): boolean {
  return FORCE_ESCALATE_CATEGORIES.includes(category);
}

/** 메시지 키워드 기반 무조건 에스컬레이션 여부 */
export function hasEscalationKeyword(text: string): boolean {
  return FORCE_ESCALATE_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * 에스컬레이션 실행:
 * 1. 봇 배정 해제 (상담사에게)
 * 2. 태그 추가
 * 3. 내부 메모
 */
export async function escalate(
  userChatId: string,
  reason: string,
  category?: string
): Promise<void> {
  try {
    await unassignFromBot(userChatId);
  } catch (e) {
    console.warn('unassignFromBot 실패 (이미 해제됨?):', e);
  }

  const tag = category ? `AI에스컬레이션-${category}` : 'AI에스컬레이션';
  await addTag(userChatId, tag);

  const memo = [
    '🤖 AI 자동응답 → 상담사 에스컬레이션',
    `사유: ${reason}`,
    category ? `카테고리: ${category}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  await addNote(userChatId, memo);
}
