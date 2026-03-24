import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import iconv from 'iconv-lite';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    // 1. 전송할 대상이 있는지 한 번 더 확인합니다.
    const { data: pendingItems } = await supabase.from('inquiries').select('id').eq('status', '전송대기');
    
    if (!pendingItems || pendingItems.length === 0) {
      return NextResponse.json({ status: 'success', message: '전송할 답변이 없습니다.', count: 0 });
    }

    // 2. 도메인 세팅
    const requestUrl = new URL(req.url);
    let domain = `${requestUrl.protocol}//${requestUrl.host}`;
    if (domain.includes('localhost')) domain = 'https://nuldamcx.vercel.app'; // 본인 도메인으로 필수 확인!

    // 3. 2단계에서 만든 답변 XML 주소 연결
    const xmlUrl = `${domain}/api/sabangnet-reply-xml?ext=.xml`;
    const encodedXmlUrl = encodeURIComponent(xmlUrl);
    
    // 사방넷 답변 등록 API 엔드포인트
    const sabangnetApiUrl = `https://sbadmin15.sabangnet.co.kr/RTL_API/xml_cs_ans.html?xml_url=${encodedXmlUrl}`;

    console.log(`[답변 전송] 사방넷 요청 URL: ${sabangnetApiUrl}`);

    // 4. 사방넷에 찌르기!
    const response = await fetch(sabangnetApiUrl, { method: 'GET' });
    if (!response.ok) throw new Error(`사방넷 API 서버 응답 오류: ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    const resultText = iconv.decode(Buffer.from(arrayBuffer), 'euc-kr');
    
    console.log("[답변 전송] 사방넷 응답 결과:", resultText);

    // 5. 전송이 완료되었으니, DB의 상태를 '전송대기'에서 '처리완료'로 바꿔줍니다.
    const idsToUpdate = pendingItems.map(item => item.id);
    await supabase.from('inquiries').update({ status: '처리완료' }).in('id', idsToUpdate);

    return NextResponse.json({ 
      status: 'success', 
      count: pendingItems.length 
    });

  } catch (error: any) {
    console.error('[답변 전송] 에러:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}