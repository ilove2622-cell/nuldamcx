// 기존 inquiries 행에 대해 사방넷 주문 상세를 다시 가져와 order_items 등을 채우는 수동 트리거.
// POST /api/order-details/refetch  body: { id: string } 또는 { orderNumber: string }
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    let { id, orderNumber } = body as { id?: string; orderNumber?: string };

    // id만 들어왔으면 order_number 조회
    if (!orderNumber && id) {
      const { data: row, error } = await supabase
        .from('inquiries')
        .select('order_number')
        .eq('id', id)
        .single();
      if (error) throw new Error(`inquiry 조회 실패: ${error.message}`);
      orderNumber = row?.order_number;
    }

    if (!orderNumber || orderNumber === '-') {
      return NextResponse.json({ success: false, error: '유효한 주문번호가 없습니다.' }, { status: 400 });
    }

    // 사방넷 호출 (기존 sabangnet-req-order 엔드포인트 재사용)
    const requestUrl = new URL(req.url);
    let domain = `${requestUrl.protocol}//${requestUrl.host}`;
    if (domain.includes('localhost')) domain = 'https://nuldamcx-delta.vercel.app';

    const xmlUrl = `${domain}/api/sabangnet-req-order?orderId=${orderNumber}&ext=.xml`;
    const sabangnetApiUrl = `https://sbadmin15.sabangnet.co.kr/RTL_API/xml_order_info.html?xml_url=${encodeURIComponent(xmlUrl)}`;

    const response = await fetch(sabangnetApiUrl, { method: 'GET' });
    if (!response.ok) throw new Error(`사방넷 응답 오류: ${response.status}`);

    const decodedXml = await response.text();
    const parser = new XMLParser({ ignoreAttributes: true, isArray: (name) => name === 'DATA' });
    const jsonObj = parser.parse(decodedXml);
    const dataList = jsonObj?.SABANG_ORDER_LIST?.DATA;

    if (!dataList || dataList.length === 0) {
      return NextResponse.json({ success: false, error: '사방넷에서 주문 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const head = dataList[0].ITEM || dataList[0];

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
        unitName:      i.P_PRODUCT_NAME ? String(i.P_PRODUCT_NAME) : (i.PRODUCT_NAME ? String(i.PRODUCT_NAME) : ''),
        barcode:       i.BARCODE ? String(i.BARCODE) : '',
        qty:           Number(i.SALE_CNT) || 1,
        gift:          isGift,
        giftName:      isGift ? String(i.GIFT_NAME) : '',
      };
    });

    const { error: upErr } = await supabase
      .from('inquiries')
      .update({
        orderer_name:     head.USER_NAME || '',
        receiver_name:    head.RECEIVE_NAME || '',
        receiver_tel:     head.RECEIVE_TEL || head.USER_TEL || '',
        shipping_address: head.RECEIVE_ZIPCODE ? `(${head.RECEIVE_ZIPCODE}) ${head.RECEIVE_ADDR}` : (head.RECEIVE_ADDR || ''),
        tracking_number:  head.INVOICE_NO || '',
        order_items:      orderItems,
      })
      .eq('order_number', orderNumber);

    if (upErr) throw new Error(`DB 업데이트 실패: ${upErr.message}`);

    return NextResponse.json({
      success: true,
      orderNumber,
      itemCount: orderItems.length,
      items: orderItems,
    });
  } catch (err: any) {
    console.error('[order-details/refetch] error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
