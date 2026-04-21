// 사방넷 주문조회 헬퍼
// 기존 app/api/webhook/fetch-order-details/route.ts 와 sabangnet-req-order/route.ts 의
// 콜백 XML 패턴을 재사용한다.
//
// 사방넷은 우리가 호스팅한 XML URL을 받아서 그 XML을 fetch해 처리하는 콜백 방식이라
// 주문조회용 XML 엔드포인트(/api/sabangnet-req-order)가 인터넷에서 접근 가능해야 함.
import { XMLParser } from 'fast-xml-parser';

export interface OrderLookupResult {
  found: boolean;
  orderNumber: string;
  productName?: string;
  optionName?: string;
  status?: string;          // 신규/출고대기/출고완료/배송중/배송완료
  courier?: string;
  trackingNumber?: string;
  receiverName?: string;
  receiverAddr?: string;
  itemCount?: number;
}

// 사방넷 주문상태 코드 → 한글 매핑 (사방넷 표준)
const STATUS_MAP: Record<string, string> = {
  '001': '신규주문',
  '002': '주문확인',
  '003': '출고대기',
  '004': '출고완료',
  '005': '배송중',
  '006': '배송완료',
  '007': '구매확정',
  '009': '취소',
};

function normalizeStatus(raw: string | undefined): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  return STATUS_MAP[trimmed] || trimmed;
}

/** 송장번호로 배송 상태 추정 */
function inferDeliveryStatus(invoiceNo: string | undefined): string {
  if (!invoiceNo || !String(invoiceNo).trim()) return '출고 전';
  return '출고완료(송장등록)';
}

// 운송장 번호 포맷팅 (4자리씩 끊기)
function formatTrackingNumber(raw: string | undefined): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 8) return digits;
  return digits.match(/.{1,4}/g)?.join('-') || digits;
}

// orderId(각 입점몰의 원본 주문번호)로 사방넷 조회
// domain 기본값: Vercel 배포 도메인
export async function lookupOrderBySabangnet(
  orderId: string,
  domain: string = 'https://nuldamcx.vercel.app'
): Promise<OrderLookupResult> {
  if (!orderId) return { found: false, orderNumber: orderId };

  try {
    const xmlUrl = `${domain}/api/sabangnet-req-order?orderId=${encodeURIComponent(orderId)}&ext=.xml`;
    const sabangnetUrl = `https://sbadmin15.sabangnet.co.kr/RTL_API/xml_order_info.html?xml_url=${encodeURIComponent(xmlUrl)}`;

    const res = await fetch(sabangnetUrl, { method: 'GET' });
    if (!res.ok) {
      console.error(`[사방넷 조회 실패] HTTP ${res.status}`);
      return { found: false, orderNumber: orderId };
    }

    const xmlText = await res.text();
    const parser = new XMLParser({ ignoreAttributes: true, isArray: (name) => name === 'DATA' });
    const parsed = parser.parse(xmlText);

    // TOTAL_COUNT 확인
    const totalCount = Number(parsed?.SABANG_ORDER_LIST?.HEADER?.TOTAL_COUNT) || 0;
    const dataList = parsed?.SABANG_ORDER_LIST?.DATA;

    if (totalCount === 0 || !dataList || dataList.length === 0) {
      return { found: false, orderNumber: orderId };
    }

    // DATA 안에 ITEM이 있는 구조 vs DATA에 직접 필드가 있는 구조 모두 처리
    const items = dataList.map((d: any) => d.ITEM || d);
    const head = items[0];

    // 상품명 + 옵션 조합 (사은품이 아닌 첫 아이템 사용)
    const mainItem = items.find((i: any) => !i.GIFT_NAME || !String(i.GIFT_NAME).trim()) || head;

    const productName = mainItem.P_PRODUCT_NAME || mainItem.PRODUCT_NAME || '';
    const optionName = mainItem.SKU_VALUE || '';

    return {
      found: true,
      orderNumber: orderId,
      productName: String(productName).trim(),
      optionName: String(optionName).trim(),
      status: normalizeStatus(head.ORDER_STATUS || head.DELV_STATUS) || inferDeliveryStatus(head.INVOICE_NO),
      courier: String(head.DELIVERY_METHOD || head.DELIVERY_COMPANY || '').trim(),
      trackingNumber: formatTrackingNumber(head.INVOICE_NO),
      receiverName: String(head.RECEIVE_NAME || '').trim(),
      receiverAddr: String(head.RECEIVE_ADDR || '').trim(),
      itemCount: dataList.length,
    };
  } catch (err: any) {
    console.error('[사방넷 조회 에러]', err.message);
    return { found: false, orderNumber: orderId };
  }
}

// 자동응답 메시지 포맷팅
export function formatOrderReply(result: OrderLookupResult): string {
  if (!result.found) {
    return `주문번호 [${result.orderNumber}] 조회 결과 정보를 찾지 못했습니다. 정확한 번호인지 한 번만 더 확인 부탁드릴게요.`;
  }

  const product = result.productName + (result.optionName ? ` (${result.optionName})` : '');
  const tracking = result.courier && result.trackingNumber
    ? `${result.courier} 송장번호 [${result.trackingNumber}]로 배송 진행 중입니다.`
    : '';

  return [
    `안녕하세요, Suggest the better 널 담입니다.`,
    ``,
    `주문번호 [${result.orderNumber}] 확인되었습니다.`,
    `[${product}] 상품은 현재 [${result.status}] 상태입니다.`,
    tracking,
    ``,
    `추가 문의사항 있으시면 편하게 말씀해주세요. 감사합니다.`,
  ].filter(Boolean).join('\n');
}
