// app/api/webhook/fetch-order-details/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import iconv from 'iconv-lite';
import { XMLParser } from 'fast-xml-parser';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const record = body.record;
    const orderId = record?.order_number;

    if (!orderId || orderId === '-') return NextResponse.json({ message: 'No Order ID' });

    console.log(`[사방넷 주문 조회] 주문번호: ${orderId}`);

    // 1. 우리가 만든 XML 생성 API의 주소 만들기 (Vercel 도메인 사용)
    const domain = 'https://nuldamcx.vercel.app'; // 본인 도메인 확인!
    const xmlUrl = `${domain}/api/sabangnet-req-order?orderId=${orderId}&ext=.xml`;
    const encodedXmlUrl = encodeURIComponent(xmlUrl);
    
    // 사방넷 어드민 주소 (sbadmin15 등 본인 호스트 번호 확인 필요)
    const sabangnetApiUrl = `https://sbadmin15.sabangnet.co.kr/RTL_API/xml_order_info.html?xml_url=${encodedXmlUrl}`;

    // 2. 사방넷에 GET 요청
    const response = await fetch(sabangnetApiUrl, { method: 'GET' });
    if (!response.ok) throw new Error(`사방넷 서버 오류: ${response.status}`);

    const decodedXml = await response.text();

    const parser = new XMLParser({ ignoreAttributes: true, isArray: (name) => name === 'DATA' });
    const jsonObj = parser.parse(decodedXml);

    const dataList = jsonObj?.SABANG_ORDER_LIST?.DATA;

    if (dataList && dataList.length > 0) {
      // 결과값 파싱
      const info = dataList[0].ITEM || dataList[0];

      // 3. DB 업데이트
      const { error } = await supabase
        .from('inquiries')
        .update({
          orderer_name: info.USER_NAME || '',
          receiver_name: info.RECEIVE_NAME || '',
          receiver_tel: info.RECEIVE_TEL || info.USER_TEL || '',
          shipping_address: info.RECEIVE_ZIPCODE ? `(${info.RECEIVE_ZIPCODE}) ${info.RECEIVE_ADDR}` : (info.RECEIVE_ADDR || ''),
          tracking_number: info.INVOICE_NO || ''
        })
        .eq('id', record.id);

      if (error) throw error;
      console.log(`✅ [${orderId}] 고객 정보 업데이트 성공!`);
    } else {
      console.log(`⚠️ [${orderId}] 사방넷에서 주문 정보를 찾을 수 없습니다.`);
    }

    return NextResponse.json({ status: 'success' });
  } catch (err: any) {
    console.error('CRITICAL ERROR:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}