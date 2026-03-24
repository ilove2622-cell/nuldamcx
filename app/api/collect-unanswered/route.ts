import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import iconv from 'iconv-lite';
import { XMLParser } from 'fast-xml-parser';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const requestUrl = new URL(req.url);
    let domain = `${requestUrl.protocol}//${requestUrl.host}`;

    
    if (domain.includes('localhost')) {
      domain = 'https://nuldamcx.vercel.app'; 
    }

    // 사방넷 시스템이 URL 끝에 .xml이 없으면 거부하는 경우를 대비한 안전장치 (?ext=.xml)
    const xmlUrl = `${domain}/api/sabangnet-req-unanswered?ext=.xml`;
    const encodedXmlUrl = encodeURIComponent(xmlUrl);
    
    const sabangnetApiUrl = `https://sbadmin15.sabangnet.co.kr/RTL_API/xml_cs_info.html?xml_url=${encodedXmlUrl}`;

    console.log(`[사방넷 요청 URL] ${sabangnetApiUrl}`);

    const response = await fetch(sabangnetApiUrl, { method: 'GET' });
    if (!response.ok) throw new Error(`사방넷 API 서버 응답 오류: ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    const decodedXml = iconv.decode(Buffer.from(arrayBuffer), 'euc-kr');

    const parser = new XMLParser({ ignoreAttributes: true, isArray: (name) => name === 'DATA' });
    const jsonObj = parser.parse(decodedXml);
    
    const dataList = jsonObj?.SABANG_CS_LIST?.DATA;

    
    if (!dataList || dataList.length === 0) {
  const header = jsonObj?.SABANG_CS_LIST?.HEADER;
  console.log("[미답변 수집] 사방넷 원본 응답:", decodedXml); // ← 추가
  console.log("[미답변 수집] 헤더 파싱 결과:", JSON.stringify(header)); // ← 추가
  
  const errMsg = header?.ERR_MSG || header?.MSG;
  if (errMsg) {
    return NextResponse.json({ status: 'error', message: `[사방넷 거부 사유] ${errMsg}` }, { status: 400 });
  }
  return NextResponse.json({ 
    status: 'success', 
    message: '새로운 미답변 문의가 없습니다.', 
    count: 0,
    debug_response: decodedXml // ← 추가
  });
}

    let newCount = 0;
    for (const item of dataList) {
      const getVal = (val: any) => val ? String(val).trim() : '';
      const num = getVal(item.NUM);
      if (!num) continue;

      const { data: existing } = await supabase.from('inquiries').select('id').eq('sabangnet_num', num).single();
      if (existing) continue;

      const { error } = await supabase.from('inquiries').insert({
        sabangnet_num: num, site_name: getVal(item.MALL_ID), seller_id: getVal(item.MALL_USER_ID),
        order_number: getVal(item.ORDER_ID), inquiry_type: getVal(item.CS_GUBUN), product_name: getVal(item.PRODUCT_NM),
        content: getVal(item.CNTS), answer: getVal(item.RPLY_CNTS), customer_name: getVal(item.INS_NM),
        status: '대기', created_at: getVal(item.INS_DM), collected_at: getVal(item.REG_DM)
      });

      if (!error) newCount++;
    }

    return NextResponse.json({ status: 'success', message: `미답변 수집 완료! 신규 추가: ${newCount}건`, count: newCount });
  } catch (error: any) {
    console.error('API 수집 에러:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}