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

    if (!orderId || orderId === '-' || String(orderId).trim() === '') {
      return NextResponse.json({ message: 'No Order ID' });
    }

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
      // 첫 행에서 고객/배송 공통 정보 추출 (모든 분리행이 같은 ORDER_ID 기준)
      const head = dataList[0].ITEM || dataList[0];

      // 모든 ITEM(분리행, 사은품 포함)을 order_items 배열로 직렬화
      const orderItems = dataList.map((d: any) => {
        const i = d.ITEM || d;
        const isGift = !!(i.GIFT_NAME && String(i.GIFT_NAME).trim());
        return {
          productId:     i.PRODUCT_ID ? String(i.PRODUCT_ID) : '',
          mallProductId: i.MALL_PRODUCT_ID ? String(i.MALL_PRODUCT_ID) : '',
          productName:   i.PRODUCT_NAME ? String(i.PRODUCT_NAME) : '',
          skuAlias:      i.SKU_ALIAS_NO ? String(i.SKU_ALIAS_NO) : '',
          sku:           i.SKU_NO ? String(i.SKU_NO) : '',
          option:        i.SKU_VALUE ? String(i.SKU_VALUE) : '',
          unitName:      i.EXPECTED_PAYOUT ? String(i.EXPECTED_PAYOUT) : '',
          barcode:       i.BARCODE ? String(i.BARCODE) : '',
          qty:           Number(i.SALE_CNT) || 1,
          gift:          isGift,
          giftName:      isGift ? String(i.GIFT_NAME) : '',
        };
      });

      // 3. 같은 ORDER_ID를 가진 모든 inquiries 행에 동기화
      //    (사방넷이 분리한 NUM 별로 우리 DB도 행이 분리되어 있으므로)
      const { error } = await supabase
        .from('inquiries')
        .update({
          orderer_name:     head.USER_NAME || '',
          receiver_name:    head.RECEIVE_NAME || '',
          receiver_tel:     head.RECEIVE_TEL || head.USER_TEL || '',
          shipping_address: head.RECEIVE_ZIPCODE ? `(${head.RECEIVE_ZIPCODE}) ${head.RECEIVE_ADDR}` : (head.RECEIVE_ADDR || ''),
          tracking_number:  head.INVOICE_NO || '',
          order_items:      orderItems,
        })
        .eq('order_number', orderId);

      if (error) throw error;
      console.log(`✅ [${orderId}] 고객/상품 정보 업데이트 성공! (items=${orderItems.length})`);
    } else {
      console.log(`⚠️ [${orderId}] 사방넷에서 주문 정보를 찾을 수 없습니다.`);
    }

    return NextResponse.json({ status: 'success' });
  } catch (err: any) {
    console.error('CRITICAL ERROR:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}