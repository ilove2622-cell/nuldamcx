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
      console.log(`[미답변 수집] localhost 감지 → 도메인 교체: ${domain}`);
    }

    const xmlUrl = `${domain}/api/sabangnet-req-unanswered?ext=.xml`;
    const encodedXmlUrl = encodeURIComponent(xmlUrl);
    const sabangnetApiUrl = `https://sbadmin15.sabangnet.co.kr/RTL_API/xml_cs_info.html?xml_url=${encodedXmlUrl}`;

    console.log(`[미답변 수집] ① 사방넷으로 보낼 xmlUrl: ${xmlUrl}`);
    console.log(`[미답변 수집] ② 최종 요청 URL: ${sabangnetApiUrl}`);

    const response = await fetch(sabangnetApiUrl, { method: 'GET' });

    console.log(`[미답변 수집] ③ 사방넷 응답 status: ${response.status} ${response.statusText}`);

    if (!response.ok) throw new Error(`사방넷 API 서버 응답 오류: ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    const decodedXml = iconv.decode(Buffer.from(arrayBuffer), 'euc-kr');

    console.log(`[미답변 수집] ④ 사방넷 원본 응답 (디코딩 후):\n${decodedXml}`);

    const parser = new XMLParser({ ignoreAttributes: true, isArray: (name) => name === 'DATA' });
    const jsonObj = parser.parse(decodedXml);

    console.log(`[미답변 수집] ⑤ 파싱된 JSON:\n${JSON.stringify(jsonObj, null, 2)}`);

    const header = jsonObj?.SABANG_CS_LIST?.HEADER;
    const dataList = jsonObj?.SABANG_CS_LIST?.DATA;

    console.log(`[미답변 수집] ⑥ HEADER:`, JSON.stringify(header));
    console.log(`[미답변 수집] ⑦ DATA 건수:`, dataList ? dataList.length : 0);

    if (!dataList || dataList.length === 0) {
      const errMsg = header?.ERR_MSG || header?.MSG || header?.ERROR || header?.RESULT_MSG;
      console.log(`[미답변 수집] ⑧ 에러 메시지 추출값: ${errMsg}`);

      if (errMsg) {
        return NextResponse.json({
          status: 'error',
          message: `[사방넷 거부 사유] ${errMsg}`,
          debug_header: header,
          debug_raw: decodedXml,
        }, { status: 400 });
      }

      return NextResponse.json({
        status: 'success',
        message: '새로운 미답변 문의가 없습니다.',
        count: 0,
        debug_header: header,
        debug_raw: decodedXml,
      });
    }

    console.log(`[미답변 수집] ⑨ 수집된 DATA 목록:`);
    dataList.forEach((item: any, i: number) => {
      console.log(`  [${i + 1}] NUM=${item.NUM}, MALL_ID=${item.MALL_ID}, CS_STATUS=${item.CS_STATUS}, SUBJECT=${item.SUBJECT}`);
    });

    let newCount = 0;
    for (const item of dataList) {
      const getVal = (val: any) => val ? String(val).trim() : '';
      const num = getVal(item.NUM);
      if (!num) {
        console.log(`[미답변 수집] NUM 없는 항목 스킵`);
        continue;
      }

      const { data: existing } = await supabase
        .from('inquiries')
        .select('id')
        .eq('sabangnet_num', num)
        .single();

      if (existing) {
        console.log(`[미답변 수집] 이미 존재 → 스킵: NUM=${num}`);
        continue;
      }

      const { error } = await supabase.from('inquiries').insert({
        sabangnet_num: num,
        site_name: getVal(item.MALL_ID),
        seller_id: getVal(item.MALL_USER_ID),
        order_number: getVal(item.ORDER_ID),
        inquiry_type: getVal(item.CS_GUBUN),
        product_name: getVal(item.PRODUCT_NM),
        content: getVal(item.CNTS),
        answer: getVal(item.RPLY_CNTS),
        customer_name: getVal(item.INS_NM),
        status: '대기',
        created_at: getVal(item.INS_DM),
        collected_at: getVal(item.REG_DM),
      });

      if (error) {
        console.error(`[미답변 수집] Supabase insert 실패 NUM=${num}:`, error.message);
      } else {
        console.log(`[미답변 수집] ✅ insert 성공: NUM=${num}`);
        newCount++;
      }
    }

    return NextResponse.json({
      status: 'success',
      message: `미답변 수집 완료! 신규 추가: ${newCount}건`,
      count: newCount,
    });

  } catch (error: any) {
    console.error('[미답변 수집] 에러:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}