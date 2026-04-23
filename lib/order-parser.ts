// 입점몰별 주문번호 패턴 식별기
// 고객 메시지에서 주문번호를 추출하고 어느 몰에서 들어온 주문인지 추정한다.
// 패턴은 Supabase inquiries 테이블의 실제 주문번호 데이터에서 도출.

export type Mall =
  | '쿠팡'
  | '스마트스토어'
  | '11번가'
  | '롯데온'
  | '롯데홈쇼핑'
  | 'CJ온스타일'
  | '카카오스타일'
  | '카카오톡스토어'
  | 'GS shop'
  | 'ESM'
  | '사방넷내부'
  | '미상';

export interface ParsedOrder {
  orderNumber: string;
  mall: Mall;
  confidence: 'high' | 'medium' | 'low';
}

// 우선순위가 중요: 더 구체적인(=긴/특수문자 포함) 패턴을 먼저 매칭
const PATTERNS: Array<{ mall: Mall; regex: RegExp; confidence: 'high' | 'medium' | 'low' }> = [
  // CJ온스타일: 20260413120122-001-001-001 (YYYYMMDD + 6자리 + -001-001-001)
  { mall: 'CJ온스타일', regex: /\b(\d{14}-\d{3}-\d{3}-\d{3})\b/g, confidence: 'high' },
  // 롯데홈쇼핑(신): 20260411D86785 (YYYYMMDD + 영문1자 + 5자리)
  { mall: '롯데홈쇼핑', regex: /\b(20\d{6}[A-Z]\d{5})\b/g, confidence: 'high' },
  // 카카오스타일(지그재그): 18자리 숫자
  { mall: '카카오스타일', regex: /\b(\d{18})\b/g, confidence: 'high' },
  // 11번가: 17자리 숫자
  { mall: '11번가', regex: /\b(\d{17})\b/g, confidence: 'high' },
  // 스마트스토어 / 롯데온: 16자리 숫자 (YYYYMMDD + 8자리)
  // 둘 다 동일 길이라 단독으로 구분 불가 → 컨텍스트로 보정
  { mall: '스마트스토어', regex: /\b(20\d{14})\b/g, confidence: 'medium' },
  // 쿠팡: 13~14자리 숫자 (예: 4100183511379, 27100182467640)
  { mall: '쿠팡', regex: /\b(\d{13,14})\b/g, confidence: 'medium' },
  // GS shop / 카카오톡스토어 / ESM: 10자리 숫자 (구분 불가)
  { mall: '미상', regex: /\b(\d{10})\b/g, confidence: 'low' },
  // 사방넷 내부번호: 8자리 숫자
  { mall: '사방넷내부', regex: /\b(\d{8})\b/g, confidence: 'low' },
];

// 메시지에 몰 이름이 직접 언급된 경우 우선 매핑
const MALL_KEYWORDS: Array<{ keywords: string[]; mall: Mall }> = [
  { keywords: ['쿠팡', 'coupang'], mall: '쿠팡' },
  { keywords: ['스마트스토어', '스토어팜', '네이버'], mall: '스마트스토어' },
  { keywords: ['11번가', '십일번가'], mall: '11번가' },
  { keywords: ['롯데홈쇼핑'], mall: '롯데홈쇼핑' },
  { keywords: ['롯데온', '롯데ON'], mall: '롯데온' },
  { keywords: ['CJ', 'cj온스타일', '온스타일'], mall: 'CJ온스타일' },
  { keywords: ['지그재그', '포스티'], mall: '카카오스타일' },
  { keywords: ['카카오톡스토어', '카톡스토어'], mall: '카카오톡스토어' },
  { keywords: ['GS shop', 'GS샵', '지에스샵'], mall: 'GS shop' },
  { keywords: ['지마켓', '옥션', 'ESM', 'esm'], mall: 'ESM' },
];

function detectMallFromContext(text: string): Mall | null {
  const lower = text.toLowerCase();
  for (const { keywords, mall } of MALL_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return mall;
    }
  }
  return null;
}

// 메시지에서 주문번호 후보를 모두 추출
// 컨텍스트(몰명 언급)가 있으면 그 몰 패턴을 우선 적용
export function parseOrderNumbers(text: string): ParsedOrder[] {
  if (!text) return [];

  const contextMall = detectMallFromContext(text);
  const found: ParsedOrder[] = [];
  const seen = new Set<string>();

  for (const { mall, regex, confidence } of PATTERNS) {
    const matches = text.matchAll(regex);
    for (const m of matches) {
      const orderNumber = m[1];
      if (seen.has(orderNumber)) continue;

      // 더 긴 패턴이 이미 매칭한 번호의 부분문자열은 제외
      // (예: 17자리가 매칭된 경우 그 안의 13자리 등은 무시)
      const isSubstring = found.some((f) => f.orderNumber.includes(orderNumber) && f.orderNumber !== orderNumber);
      if (isSubstring) continue;

      seen.add(orderNumber);
      found.push({
        orderNumber,
        mall: contextMall && (mall === '미상' || mall === '쿠팡' || mall === '스마트스토어') ? contextMall : mall,
        confidence: contextMall ? 'high' : confidence,
      });
    }
  }

  return found;
}

// 가장 신뢰도 높은 주문번호 1건만 반환 (자동응답용)
export function pickPrimaryOrder(text: string): ParsedOrder | null {
  const orders = parseOrderNumbers(text);
  if (orders.length === 0) return null;
  const priority = { high: 0, medium: 1, low: 2 };
  return orders.sort((a, b) => priority[a.confidence] - priority[b.confidence])[0];
}

// ─── 다중 검색 기준 매칭 ───

export type SearchCriteria =
  | { type: 'order_id'; value: string; mall: Mall; confidence: string }
  | { type: 'tracking_no'; value: string }
  | { type: 'receiver_tel'; value: string }
  | { type: 'orderer_tel'; value: string }
  | { type: 'phone'; value: string }; // 수취인/주문자 구분 불가 시

// 전화번호 패턴: 010-XXXX-XXXX, 01012345678, 010 1234 5678
const PHONE_REGEX = /\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g;

// 송장번호 키워드
const TRACKING_KEYWORDS = ['송장', '운송장', '택배번호', '배송번호', '송장번호', '운송장번호'];

// 수취인/주문자 구분 키워드
const RECEIVER_KEYWORDS = ['받는분', '수취인', '수령인', '받는사람'];
const ORDERER_KEYWORDS = ['주문자', '본인', '주문한사람'];

/** 키워드가 value 앞 30자 이내에 존재하는지 체크 */
function hasNearbyKeyword(text: string, value: string, keywords: string[]): boolean {
  const idx = text.indexOf(value);
  if (idx < 0) return false;
  const before = text.slice(Math.max(0, idx - 30), idx);
  return keywords.some(kw => before.includes(kw));
}

/** 메시지에서 검색 기준 후보를 모두 추출 */
export function parseSearchCriteria(text: string): SearchCriteria[] {
  if (!text) return [];

  const results: SearchCriteria[] = [];

  // 1. 기존 주문번호 파서
  const orders = parseOrderNumbers(text);
  for (const o of orders) {
    // 송장번호 키워드가 근처에 있으면 tracking_no로 분류 (12~14자리)
    if (o.orderNumber.length >= 12 && o.orderNumber.length <= 14 &&
        hasNearbyKeyword(text, o.orderNumber, TRACKING_KEYWORDS)) {
      results.push({ type: 'tracking_no', value: o.orderNumber });
    } else {
      results.push({ type: 'order_id', value: o.orderNumber, mall: o.mall, confidence: o.confidence });
    }
  }

  // 2. 전화번호 감지
  const phoneMatches = text.matchAll(PHONE_REGEX);
  for (const m of phoneMatches) {
    const raw = m[0];
    const digits = raw.replace(/[-\s]/g, '');

    // 이미 주문번호로 잡힌 숫자열과 겹치면 스킵
    if (orders.some(o => o.orderNumber === digits || o.orderNumber.includes(digits))) continue;

    if (hasNearbyKeyword(text, raw, RECEIVER_KEYWORDS)) {
      results.push({ type: 'receiver_tel', value: digits });
    } else if (hasNearbyKeyword(text, raw, ORDERER_KEYWORDS)) {
      results.push({ type: 'orderer_tel', value: digits });
    } else {
      results.push({ type: 'phone', value: digits });
    }
  }

  // 3. 키워드 단독 송장번호 (주문번호로 이미 잡혔지만 tracking 키워드 매칭 안 된 경우 보완)
  // 텍스트에 송장 키워드가 있고, 12~14자리 숫자가 있으면 tracking_no 추가
  if (TRACKING_KEYWORDS.some(kw => text.includes(kw))) {
    const trackingMatches = text.matchAll(/\b(\d{12,14})\b/g);
    for (const m of trackingMatches) {
      const val = m[1];
      if (!results.some(r => r.value === val)) {
        results.push({ type: 'tracking_no', value: val });
      }
    }
  }

  return results;
}

/** 가장 우선순위 높은 검색 기준 1건 반환 */
export function pickPrimarySearch(text: string): SearchCriteria | null {
  const criteria = parseSearchCriteria(text);
  if (criteria.length === 0) return null;

  // 우선순위: order_id > tracking_no > receiver_tel > orderer_tel > phone
  const priority: Record<string, number> = {
    order_id: 0,
    tracking_no: 1,
    receiver_tel: 2,
    orderer_tel: 3,
    phone: 4,
  };

  return criteria.sort((a, b) => priority[a.type] - priority[b.type])[0];
}
