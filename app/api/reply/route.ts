import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import iconv from 'iconv-lite';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    // 1. 프론트엔드에서 보낸 ID 목록을 받습니다.
    const body = await req.json();
    const { ids } = body;

    if (!ids || ids.length === 0) {
        return NextResponse.json({ status: 'error', message: '전달된 ID가 없습니다.' }, { status: 400 });
    }

    // 2. 상태가 '답변저장'인 항목들만 추려냅니다.
    const { data: pendingItems } = await supabase
      .from('inquiries')
      .select('id')
      .in('id', ids)
      .eq('status', '답변저장');
    
    if (!pendingItems || pendingItems.length === 0) {
      return NextResponse.json({ status: 'success', message: '전송할 답변이 없습니다.', count: 0 });
    }

    // 3. 도메인 세팅 (로컬 테스트 시 로컬호스트 주소가 들어가면 사방넷 서버가 우리 XML에 접근하지 못합니다.)
    const requestUrl = new URL(req.url);
    let domain = `${requestUrl.protocol}//${requestUrl.host}`;
    if (domain.includes('localhost')) {
      domain = 'https://nuldamcx.vercel.app'; // Vercel에 배포된 실제 주소
    }

    // 4. 사방넷에 전송할 XML 주소 생성
    const xmlUrl = `${domain}/api/sabangnet-reply-xml?ext=.xml`;
    const encodedXmlUrl = encodeURIComponent(xmlUrl);
    
    // 사방넷 답변 등록 API 엔드포인트
    const sabangnetApiUrl = `https://sbadmin15.sabangnet.co.kr/RTL_API/xml_cs_ans.html?xml_url=${encodedXmlUrl}`;

    console.log(`[답변 전송] 사방넷 요청 URL: ${sabangnetApiUrl}`);

    // 5. 사방넷에 찌르기!
    const response = await fetch(sabangnetApiUrl, { method: 'GET' });
    if (!response.ok) throw new Error(`사방넷 API 서버 응답 오류: ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    const resultText = iconv.decode(Buffer.from(arrayBuffer), 'euc-kr');

    console.log("[답변 전송] 사방넷 응답 결과:", resultText);

    // 🌟 6. 성공 여부 판단 후 상태 업데이트
    const hasSuccess = resultText.includes('성공') || resultText.includes('blue');
    const countMatch = resultText.match(/총건수\s*:\s*(\d+)/);
    const processedCount = countMatch ? parseInt(countMatch[1]) : 0;

    if (processedCount > 0 || hasSuccess) {
      // 전송 성공 시 상태를 처리완료로 변경
      await supabase.from('inquiries').update({ status: '처리완료' }).eq('status', '답변저장');
    }

    return NextResponse.json({
      status: 'success',
      count: processedCount || pendingItems.length,
      sabangnetResponse: resultText,
      processed: processedCount > 0 || hasSuccess
    });

  } catch (error: any) {
    console.error('[답변 전송] 에러:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}