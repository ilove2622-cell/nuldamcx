// app/api/webhook/fetch-order-details/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("1. Webhook Body 수신:", JSON.stringify(body)); // 데이터가 잘 들어오는지 확인

    const record = body.record;
    const orderId = record?.order_number;

    if (!orderId || orderId === '-') {
      console.log("2. 주문번호 없음, 종료");
      return NextResponse.json({ message: 'No Order ID' });
    }

    console.log(`3. 사방넷 조회 시작: 주문번호 ${orderId}`);

    const sabangRes = await fetch('https://api.sbfulfillment.co.kr/v2/orders/detail', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'X-API-KEY': process.env.SABANGNET_FULFILLMENT_KEY || '' 
      },
      body: JSON.stringify({ order_no: orderId })
    });

    const orderData = await sabangRes.json();
    console.log("4. 사방넷 응답 수신:", JSON.stringify(orderData));

    // 만약 데이터가 'data' 키 안에 들어있다면?
    const info = orderData.data || orderData; 

    // DB 업데이트
    const { error } = await supabase
      .from('inquiries')
      .update({
        receiver_name: info.receive_name || '이름 누락',
        receiver_tel: info.receive_hp || info.receive_tel || '번호 누락',
        shipping_address: info.receive_addr || '주소 누락',
        delivery_msg: info.dlv_msg || ''
      })
      .eq('id', record.id);

    if (error) {
      console.error("5. Supabase 업데이트 에러:", error);
      throw error;
    }

    console.log("6. 업데이트 성공!");
    return NextResponse.json({ status: 'success' });
  } catch (err: any) {
    console.error('CRITICAL ERROR:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}