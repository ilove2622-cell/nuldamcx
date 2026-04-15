// 단품코드/확정옵션명 등 사방넷 필드 발견용 디버그 엔드포인트.
// GET /api/order-details/debug?orderId=XXX
// 가능한 모든 후보 필드를 넣어 raw 응답 구조를 그대로 반환.
// 사용 후 정식 ORD_FIELD에서 실제로 값이 채워진 필드만 남기고 정리.
import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get('orderId');
    if (!orderId) {
      return NextResponse.json({ error: 'orderId 쿼리 파라미터가 필요합니다.' }, { status: 400 });
    }

    // 1) 임시 XML 생성 — 단품/옵션 관련 후보 필드를 광범위하게 포함
    const today = new Date();
    const past = new Date();
    past.setMonth(today.getMonth() - 6);
    const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;

    // 단품/옵션 관련 후보 (실제 사방넷 응답에서 채워지는 것만 추후 정식 적용)
    const candidateFields = [
      'ORDER_ID', 'PRODUCT_NAME', 'PRODUCT_ID', 'MALL_PRODUCT_ID', 'SKU_VALUE', 'SALE_CNT', 'BARCODE',
      // P_PRODUCT_NAME(=확정옵션/단품명) 짝꿍 코드 후보
      'P_PRODUCT_NO', 'P_PRODUCT_CODE', 'P_PRODUCT_SEQ',
      'P_SKU_NO', 'P_SKU_ALIAS', 'P_SKU_ALIAS_NO',
      'P_BUNDLE_NO', 'P_BUNDLE_NAME', 'P_BUNDLE_SEQ',
      'P_OPTION_NO', 'P_OPTION_T', 'P_OPTION_NM',
      'P_BARCODE',
      // 매핑 관련
      'MAPPING_NO', 'MAPPING_PRODUCT_NO', 'MAPPING_PRODUCT_NAME',
      'MATCH_PRODUCT_NO', 'MATCH_PRODUCT_NAME',
      'JUNG_PRODUCT_NO', 'JUNG_PRODUCT_NAME',
      // 처리/출고 SKU
      'OUT_SKU_NO', 'OUT_SKU_NAME', 'OUT_PRODUCT_NO',
      'PRESS_SKU_NO', 'PRESS_PRODUCT_NO',
      // 추가 가능성
      'PUMBUN_CODE', 'BUNDLE_CODE', 'SKU_CODE',
      'OPTION_NO', 'OPTION_CODE',
    ].join('|');

    // 만들기는 우리 도메인에서 호스트
    let domain = `${url.protocol}//${url.host}`;
    if (domain.includes('localhost')) domain = 'https://nuldamcx-delta.vercel.app';

    // 임시 XML을 별도 엔드포인트 없이 직접 만들어 base64 data URL로... 는 사방넷이 안 받음.
    // 대신 기존 sabangnet-req-order에 fields 파라미터를 추가하면 좋지만 수정 없이 가려면
    // 한 번 호출용 별도 inline-xml 엔드포인트를 만들 수도 있음.
    // 가장 간단한 방법: 기존 sabangnet-req-order는 그대로 두고, 여기서 사방넷 직접 호출용 임시 XML URL을 노출.
    // → 새 라우트 /api/order-details/debug-xml 도 같이 추가
    const xmlUrl = `${domain}/api/order-details/debug-xml?orderId=${orderId}&fields=${encodeURIComponent(candidateFields)}`;
    const sabangnetUrl = `https://sbadmin15.sabangnet.co.kr/RTL_API/xml_order_info.html?xml_url=${encodeURIComponent(xmlUrl)}`;

    const res = await fetch(sabangnetUrl, { method: 'GET' });
    if (!res.ok) throw new Error(`사방넷 응답 오류: ${res.status}`);
    const decoded = await res.text();

    const parser = new XMLParser({ ignoreAttributes: true, isArray: (name) => name === 'DATA' });
    const parsed = parser.parse(decoded);
    const dataList = parsed?.SABANG_ORDER_LIST?.DATA;

    if (!dataList || dataList.length === 0) {
      return NextResponse.json({
        success: false,
        message: '사방넷에서 주문 정보 없음',
        rawXmlPreview: decoded.slice(0, 2000),
      });
    }

    // 모든 ITEM의 모든 필드를 그대로 반환 (값이 있는 필드만 어떤 게 있는지 보기 위함)
    const items = dataList.map((d: any) => d.ITEM || d);

    // 값이 비어있지 않은 필드만 추출해서 보기 쉽게
    const nonEmptyFieldsPerItem = items.map((it: any) => {
      const o: Record<string, any> = {};
      for (const k of Object.keys(it)) {
        const v = it[k];
        if (v !== null && v !== undefined && String(v).trim() !== '') {
          o[k] = v;
        }
      }
      return o;
    });

    return NextResponse.json({
      success: true,
      orderId,
      itemCount: items.length,
      candidateFieldsRequested: candidateFields.split('|'),
      nonEmptyFieldsPerItem,
      rawItems: items,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
