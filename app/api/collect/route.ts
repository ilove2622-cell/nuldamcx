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
      domain = 'https://nuldamcx-delta.vercel.app'; // 본인 도메인 확인
    }

    // [전체 수집]용 XML 요청 주소 연결
    const xmlUrl = `${domain}/api/sabangnet-req?ext=.xml`;
    const encodedXmlUrl = encodeURIComponent(xmlUrl);
    const sabangnetApiUrl = `https://sbadmin15.sabangnet.co.kr/RTL_API/xml_cs_info.html?xml_url=${encodedXmlUrl}`;

    console.log(`[전체 수집] 요청 시작 → ${sabangnetApiUrl}`);

    const response = await fetch(sabangnetApiUrl, { method: 'GET' });
    if (!response.ok) throw new Error(`사방넷 API 서버 응답 오류: ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    const decodedXml = iconv.decode(Buffer.from(arrayBuffer), 'euc-kr');

    const parser = new XMLParser({ ignoreAttributes: true, isArray: (name) => name === 'DATA' });
    const jsonObj = parser.parse(decodedXml);

    const header = jsonObj?.SABANG_CS_LIST?.HEADER;
    const dataList = jsonObj?.SABANG_CS_LIST?.DATA;

    console.log(`[전체 수집] 사방넷 수신 건수: ${dataList?.length ?? 0}`);

    if (!dataList || dataList.length === 0) {
      const errMsg = header?.ERR_MSG || header?.MSG || header?.ERROR || header?.RESULT_MSG;
      if (errMsg) {
        return NextResponse.json({ status: 'error', message: `[사방넷 거부 사유] ${errMsg}` }, { status: 400 });
      }
      return NextResponse.json({ status: 'success', message: '새로운 문의사항이 없습니다.', count: 0 });
    }

    const getVal = (val: any): string => val ? String(val).trim() : '';

    // 💡 [핵심 방어막] 날짜가 비어있을 경우 대체값(fallbackVal)을 사용해 Null Constraint를 원천 차단합니다!
    const toTimestamp = (val: any, fallbackVal?: any): string | null => {
      let s = getVal(val);
      if (s.length !== 14 && fallbackVal) {
        s = getVal(fallbackVal); // 문의일자가 없으면 수집일자로 대체
      }
      if (s.length !== 14) return null; // 그래도 없으면 어쩔 수 없이 null (DB가 튕겨냄)
      return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}`;
    };

    const incomingNums = dataList.map((item: any) => getVal(item.NUM)).filter(Boolean);

    const { data: existingRows, error: fetchError } = await supabase
      .from('inquiries')
      .select('sabangnet_num')
      .in('sabangnet_num', incomingNums);

    if (fetchError) throw new Error(`기존 데이터 조회 실패: ${fetchError.message}`);

    const existingSet = new Set((existingRows ?? []).map((r: any) => r.sabangnet_num));
    console.log(`[전체 수집] DB 기존: ${existingSet.size}건 / 신규 후보: ${incomingNums.length - existingSet.size}건`);

    const newItems = dataList
      .filter((item: any) => {
        const num = getVal(item.NUM);
        return num && !existingSet.has(num);
      })
      .map((item: any) => ({
        sabangnet_num: getVal(item.NUM),
        channel:       getVal(item.MALL_ID),
        site_name:     getVal(item.MALL_ID),
        seller_id:     getVal(item.MALL_USER_ID),
        order_number:  getVal(item.ORDER_ID),
        inquiry_type:  getVal(item.CS_GUBUN),
        product_name:  getVal(item.PRODUCT_NM),
        content:       getVal(item.CNTS),
        answer:        getVal(item.RPLY_CNTS),
        customer_name: getVal(item.INS_NM),
        status:        '대기',
        inquiry_date:  toTimestamp(item.INS_DM, item.REG_DM), // null 방어 적용!
        created_at:    toTimestamp(item.INS_DM, item.REG_DM),
        collected_at:  toTimestamp(item.REG_DM),
      }));

    if (newItems.length === 0) {
      return NextResponse.json({ status: 'success', message: '신규 문의사항이 없습니다.', count: 0 });
    }

    const BATCH_SIZE = 100;
    let insertedCount = 0;

    for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
      const batch = newItems.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabase.from('inquiries').insert(batch);

      if (insertError) {
        console.error(`[전체 수집] batch insert 실패 (${i + 1}~${i + batch.length}번):`, insertError.message);
      } else {
        insertedCount += batch.length;
        console.log(`[전체 수집] batch insert 성공: ${i + 1}~${i + batch.length}번`);
      }
    }

    // 신규 건 주문 상세 자동 조회 (주문번호가 있는 건만, 중복 제거)
    const orderNumbers = [...new Set(
      newItems
        .map((item: any) => item.order_number)
        .filter((n: string) => n && n !== '-')
    )];

    let detailCount = 0;
    const reqUrl2 = new URL(req.url);
    let detailDomain = `${reqUrl2.protocol}//${reqUrl2.host}`;
    if (detailDomain.includes('localhost')) detailDomain = 'https://nuldamcx-delta.vercel.app';

    for (const orderNum of orderNumbers) {
      try {
        const xmlUrl = `${detailDomain}/api/sabangnet-req-order?orderId=${orderNum}&ext=.xml`;
        const sabangnetApiUrl = `https://sbadmin15.sabangnet.co.kr/RTL_API/xml_order_info.html?xml_url=${encodeURIComponent(xmlUrl)}`;
        const detailRes = await fetch(sabangnetApiUrl, { method: 'GET' });
        if (!detailRes.ok) continue;

        const detailXml = await detailRes.text();
        const detailParser = new XMLParser({ ignoreAttributes: true, isArray: (name) => name === 'DATA' });
        const detailJson = detailParser.parse(detailXml);
        const detailList = detailJson?.SABANG_ORDER_LIST?.DATA;
        if (!detailList || detailList.length === 0) continue;

        const head = detailList[0].ITEM || detailList[0];
        const orderItems = detailList.map((d: any) => {
          const it = d.ITEM || d;
          const isGift = !!(it.GIFT_NAME && String(it.GIFT_NAME).trim());
          return {
            productId: it.PRODUCT_ID ? String(it.PRODUCT_ID) : '',
            mallProductId: it.MALL_PRODUCT_ID ? String(it.MALL_PRODUCT_ID) : '',
            productName: it.PRODUCT_NAME ? String(it.PRODUCT_NAME) : '',
            skuAlias: it.SKU_ALIAS_NO ? String(it.SKU_ALIAS_NO) : '',
            sku: it.SKU_NO ? String(it.SKU_NO) : '',
            option: it.SKU_VALUE ? String(it.SKU_VALUE) : '',
            unitName: it.P_PRODUCT_NAME ? String(it.P_PRODUCT_NAME) : (it.PRODUCT_NAME ? String(it.PRODUCT_NAME) : ''),
            barcode: it.BARCODE ? String(it.BARCODE) : '',
            qty: Number(it.SALE_CNT) || 1,
            gift: isGift,
            giftName: isGift ? String(it.GIFT_NAME) : '',
          };
        });

        await supabase
          .from('inquiries')
          .update({
            orderer_name: head.USER_NAME || '',
            receiver_name: head.RECEIVE_NAME || '',
            receiver_tel: head.RECEIVE_TEL || head.USER_TEL || '',
            shipping_address: head.RECEIVE_ZIPCODE ? `(${head.RECEIVE_ZIPCODE}) ${head.RECEIVE_ADDR}` : (head.RECEIVE_ADDR || ''),
            tracking_number: head.INVOICE_NO || '',
            order_items: orderItems,
          })
          .eq('order_number', orderNum);

        detailCount++;
      } catch (e: any) {
        console.warn(`[전체 수집] 주문 상세 조회 실패 (${orderNum}):`, e.message);
      }
    }

    console.log(`[전체 수집] 주문 상세 자동 조회: ${detailCount}/${orderNumbers.length}건`);

    return NextResponse.json({
      status: 'success',
      message: `전체 수집 완료! 신규 추가: ${insertedCount}건, 상세 조회: ${detailCount}건`,
      count: insertedCount,
    });

  } catch (error: any) {
    console.error('[전체 수집] 에러:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}