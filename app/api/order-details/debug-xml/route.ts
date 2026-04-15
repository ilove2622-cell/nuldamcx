// debug용 — 가변 ORD_FIELD를 받아 사방넷 요청 XML을 생성하는 보조 엔드포인트
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('orderId');
  const fields = searchParams.get('fields');
  if (!orderId || !fields) return new Response('Missing orderId or fields', { status: 400 });

  const today = new Date();
  const past = new Date();
  past.setMonth(today.getMonth() - 6);
  const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<SABANG_ORDER_LIST>
    <HEADER>
        <SEND_COMPAYNY_ID>${process.env.SABANGNET_ID}</SEND_COMPAYNY_ID>
        <SEND_AUTH_KEY>${process.env.SABANGNET_API_KEY}</SEND_AUTH_KEY>
        <SEND_DATE>${fmt(today)}</SEND_DATE>
    </HEADER>
    <DATA>
        <ITEM>
            <ORD_ST_DATE>${fmt(past)}</ORD_ST_DATE>
            <ORD_ED_DATE>${fmt(today)}</ORD_ED_DATE>
            <ORD_FIELD>${fields}</ORD_FIELD>
            <ORDER_ID>${orderId}</ORDER_ID>
            <LANG>UTF-8</LANG>
        </ITEM>
    </DATA>
</SABANG_ORDER_LIST>`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
