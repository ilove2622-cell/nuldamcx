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

  // 요청할 필드: 주문번호|주문자명|수취인명|주문자전화|수취인전화|우편번호|주소|송장번호
  const ordField = 'ORDER_ID|USER_NAME|RECEIVE_NAME|USER_TEL|RECEIVE_TEL|RECEIVE_ZIPCODE|RECEIVE_ADDR|INVOICE_NO';

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