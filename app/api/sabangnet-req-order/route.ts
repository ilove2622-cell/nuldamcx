import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('orderId');

  if (!orderId) {
    return new Response('Missing orderId', { status: 400 });
  }

  // 오늘 날짜 및 3달 전 날짜 구하기 (검색 범위)
  const today = new Date();
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(today.getMonth() - 6);

  const formatDate = (date: Date) => {
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  };

  // 요청할 필드: 고객/배송 + 상품 정보(다중 아이템·사은품 포함)
  const ordField = [
    // 고객/배송
    'ORDER_ID', 'USER_NAME', 'RECEIVE_NAME', 'USER_TEL', 'RECEIVE_TEL',
    'RECEIVE_ZIPCODE', 'RECEIVE_ADDR', 'INVOICE_NO',
    // 주문/배송 상태
    'ORDER_STATUS',      // 주문상태 코드
    'DELV_STATUS',       // 배송상태 코드
    'DELIVERY_METHOD',   // 택배사
    'DELIVERY_COMPANY',  // 택배사 (대안 필드)
    'SHIP_HOPE_DATE',    // 출고예정일
    'SHIP_DATE',         // 출고일
    'ORDER_DATE',        // 주문일
    // 상품 (한 주문에 여러 ITEM이 분리되어 내려옴)
    'PRODUCT_ID',        // 자체상품코드
    'MALL_PRODUCT_ID',   // 쇼핑몰상품코드
    'PRODUCT_NAME',      // 수집상품명
    'SKU_ALIAS_NO',      // 품번(SKU)코드
    'SKU_NO',            // SKU 번호
    'SKU_VALUE',         // 수집옵션선택
    'P_PRODUCT_NAME',    // ✅ 확정옵션명/처리 단품명 (예: "널담 네모바게트 호두크랜베리 6개입")
    'SALE_CNT',          // 수량
    'BARCODE',           // 바코드(있으면)
    'GIFT_NAME',         // 사은품명 (사은품 분리행 식별)
  ].join('|');

  // XML 문자열 조립
  const xmlData = `<?xml version="1.0" encoding="utf-8"?>
<SABANG_ORDER_LIST>
    <HEADER>
        <SEND_COMPAYNY_ID>${process.env.SABANGNET_ID}</SEND_COMPAYNY_ID>
        <SEND_AUTH_KEY>${process.env.SABANGNET_API_KEY}</SEND_AUTH_KEY>
        <SEND_DATE>${formatDate(today)}</SEND_DATE>
    </HEADER>
    <DATA>
        <ITEM>
            <ORD_ST_DATE>${formatDate(threeMonthsAgo)}</ORD_ST_DATE>
            <ORD_ED_DATE>${formatDate(today)}</ORD_ED_DATE>
            <ORD_FIELD>${ordField}</ORD_FIELD>
            <ORDER_ID>${orderId}</ORDER_ID>
            <LANG>UTF-8</LANG>
        </ITEM>
    </DATA>
</SABANG_ORDER_LIST>`;

  return new Response(xmlData, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}