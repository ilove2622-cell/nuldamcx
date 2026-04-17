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
