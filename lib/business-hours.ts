/**
 * 상담 시간 판단 유틸리티
 * 평일 10:00~17:00 KST, 주말·공휴일 휴무
 */

const KST_OFFSET = 9 * 60 * 60 * 1000;

/** 2026년 한국 공휴일 (MM-DD) — 대체공휴일 포함 */
const HOLIDAYS_2026: string[] = [
  '01-01', // 신정
  '02-15', // 설날 연휴
  '02-16', // 설날
  '02-17', // 설날 연휴
  '02-18', // 설날 대체공휴일
  '03-01', // 삼일절
  '05-05', // 어린이날
  '05-24', // 부처님오신날
  '06-06', // 현충일
  '08-15', // 광복절
  '08-17', // 광복절 대체공휴일
  '09-24', // 추석 연휴
  '09-25', // 추석
  '09-26', // 추석 연휴
  '10-03', // 개천절
  '10-05', // 개천절 대체공휴일
  '10-09', // 한글날
  '12-25', // 크리스마스
];

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

/** 현재 KST Date 반환 */
function nowKST(): Date {
  return new Date(Date.now() + KST_OFFSET);
}

/** Date를 KST MM-DD 문자열로 */
function toMMDD(d: Date): string {
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${m}-${day}`;
}

/** 해당 날짜가 공휴일인지 */
function isHoliday(d: Date): boolean {
  return HOLIDAYS_2026.includes(toMMDD(d));
}

/** 해당 날짜가 영업일(평일 + 비공휴일)인지 */
function isBusinessDay(d: Date): boolean {
  const dow = d.getUTCDay(); // KST date를 UTC로 계산 (offset 이미 적용됨)
  if (dow === 0 || dow === 6) return false; // 일/토
  if (isHoliday(d)) return false;
  return true;
}

/** 다음 영업일 KST Date (10:00) 반환 */
function getNextBusinessDay(from: Date): Date {
  const next = new Date(from);
  // 다음 날부터 탐색
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(10, 0, 0, 0);
  while (!isBusinessDay(next)) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

/** 다음 영업일 설명 문자열 (예: "내일 오전 10시", "월요일 오전 10시") */
function describeNextOpen(now: Date, nextBiz: Date): string {
  const nowDay = now.getUTCDate();
  const nextDay = nextBiz.getUTCDate();
  const nowMonth = now.getUTCMonth();
  const nextMonth = nextBiz.getUTCMonth();
  const diffDays = Math.round(
    (Date.UTC(nextBiz.getUTCFullYear(), nextMonth, nextDay) -
      Date.UTC(now.getUTCFullYear(), nowMonth, nowDay)) /
      (24 * 60 * 60 * 1000)
  );
  const dayName = DAY_NAMES[nextBiz.getUTCDay()];

  if (diffDays === 1) {
    return '내일 오전 10시';
  }
  if (diffDays <= 6) {
    return `${dayName}요일 오전 10시`;
  }
  return `${nextMonth + 1}월 ${nextDay}일(${dayName}) 오전 10시`;
}

export interface BusinessHoursResult {
  isOpen: boolean;
  nextOpenDesc: string;
}

/**
 * 현재 상담 가능 시간인지 확인
 * @returns isOpen + 다음 영업 시간 설명
 */
export function checkBusinessHours(): BusinessHoursResult {
  const now = nowKST();
  const hour = now.getUTCHours();

  const open = isBusinessDay(now) && hour >= 10 && hour < 17;

  if (open) {
    return { isOpen: true, nextOpenDesc: '' };
  }

  // 현재 영업일이지만 17시 이후이거나, 영업일 아닌 경우
  let nextBiz: Date;
  if (isBusinessDay(now) && hour < 10) {
    // 오늘 아직 10시 전 → 오늘이 다음 영업일
    nextBiz = new Date(now);
    nextBiz.setUTCHours(10, 0, 0, 0);
  } else {
    nextBiz = getNextBusinessDay(now);
  }

  return {
    isOpen: false,
    nextOpenDesc: describeNextOpen(now, nextBiz),
  };
}

/**
 * 다음 영업일 10:00 KST의 실제 UTC ISO 문자열 (snoozed_until 저장용)
 */
export function getNextBusinessDayISO(): string {
  const now = nowKST();
  const nextBiz = getNextBusinessDay(now);
  // nextBiz는 KST 기준이므로 -9h → UTC
  const utc = new Date(nextBiz.getTime() - KST_OFFSET);
  return utc.toISOString();
}
