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

    const xmlUrl = `${domain}/api/sabangnet-req-unanswered?ext=.xml`;
    const encodedXmlUrl = encodeURIComponent(xmlUrl);
    const sabangnetApiUrl = `https://sbadmin15.sabangnet.co.kr/RTL_API/xml_cs_info.html?xml_url=${encodedXmlUrl}`;

    console.log(`[미답변 수집] 요청 시작 → ${sabangnetApiUrl}`);

    const response = await fetch(sabangnetApiUrl, { method: 'GET' });
    if (!response.ok) throw new Error(`사방넷 API 서버 응답 오류: ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    const decodedXml = iconv.decode(Buffer.from(arrayBuffer), 'euc-kr');

    const parser = new XMLParser({ ignoreAttributes: true, isArray: (name) => name === 'DATA' });
    const jsonObj = parser.parse(decodedXml);

    const header = jsonObj?.SABANG_CS_LIST?.HEADER;
    const dataList = jsonObj?.SABANG_CS_LIST?.DATA;

    console.log(`[미답변 수집] 사방넷 수신 건수: ${dataList?.length ?? 0}`);

    if (!dataList || dataList.length === 0) {
      const errMsg = header?.ERR_MSG || header?.MSG || header?.ERROR || header?.RESULT_MSG;
      if (errMsg) {
        return NextResponse.json({ status: 'error', message: `[사방넷 거부 사유] ${errMsg}` }, { status: 400 });
      }
      return NextResponse.json({ status: 'success', message: '새로운 미답변 문의가 없습니다.', count: 0 });
    }

    const getVal = (val: any) => val ? String(val).trim() : '';

    // ① 수신된 NUM 목록 추출
    const incomingNums = dataList
      .map((item: any) => getVal(item.NUM))
      .filter(Boolean);

    // ② 기존 NUM 일괄 조회 (DB 요청 1번으로 해결 — 핵심 개선)
    const { data: existingRows, error: fetchError } = await supabase
      .from('inquiries')
      .select('sabangnet_num')
      .in('sabangnet_num', incomingNums);

    if (fetchError) throw new Error(`기존 데이터 조회 실패: ${fetchError.message}`);

    const existingSet = new Set((existingRows ?? []).map((r: any) => r.sabangnet_num));
    console.log(`[미답변 수집] DB 기존: ${existingSet.size}건 / 신규 후보: ${incomingNums.length - existingSet.size}건`);

    // ③ 신규 건만 필터링
    const newItems = dataList
      .filter((item: any) => {
        const num = getVal(item.NUM);
        return num && !existingSet.has(num);
      })
      .map((item: any) => ({
        sabangnet_num: getVal(item.NUM),
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
      }));

    if (newItems.length === 0) {
      return NextResponse.json({ status: 'success', message: '신규 미답변 문의가 없습니다.', count: 0 });
    }

    // ④ 100건씩 분할 일괄 insert (DB 요청 최소화 — 핵심 개선)
    const BATCH_SIZE = 100;
    let insertedCount = 0;

    for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
      const batch = newItems.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabase.from('inquiries').insert(batch);

      if (insertError) {
        console.error(`[미답변 수집] batch insert 실패 (${i + 1}~${i + batch.length}번):`, insertError.message);
      } else {
        insertedCount += batch.length;
        console.log(`[미답변 수집] batch insert 성공: ${i + 1}~${i + batch.length}번`);
      }
    }

    return NextResponse.json({
      status: 'success',
      message: `미답변 수집 완료! 신규 추가: ${insertedCount}건`,
      count: insertedCount,
    });

  } catch (error: any) {
    console.error('[미답변 수집] 에러:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}