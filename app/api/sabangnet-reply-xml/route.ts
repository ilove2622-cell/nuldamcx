import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import iconv from 'iconv-lite';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  const SABANGNET_ID = process.env.SABANGNET_ID || '';
  const SABANGNET_API_KEY = process.env.SABANGNET_API_KEY || '';

  // 🌟 [핵심 수정] '전송대기'가 아닌 '답변저장' 상태인 문의글을 가져오도록 수정했습니다!
  const { data: pendingItems } = await supabase
    .from('inquiries')
    .select('sabangnet_num, admin_reply')
    .eq('status', '답변저장');

  // 날짜 형식 맞추기 (YYYYMMDD)
  const now = new Date();
  const kstTime = now.getTime() + (9 * 60 * 60 * 1000);
  const targetDate = new Date(kstTime);
  const sendDate = `${targetDate.getFullYear()}${String(targetDate.getMonth() + 1).padStart(2, '0')}${String(targetDate.getDate()).padStart(2, '0')}`;

  // 2. 답변 내용물 조립
  let dataXml = '';
  if (pendingItems && pendingItems.length > 0) {
    dataXml += `
    <DATA>`;
    pendingItems.forEach(item => {
      dataXml += `
        <ITEM>
            <NUM><![CDATA[${item.sabangnet_num}]]></NUM>
            <CS_RE_CONTENT><![CDATA[${item.admin_reply || ''}]]></CS_RE_CONTENT>
            <CS_RE_SEND_FLAG>Y</CS_RE_SEND_FLAG>
            <SEND_FLAG>Y</SEND_FLAG>
        </ITEM>`;
    });
    dataXml += `
    </DATA>`;
  }

  // 3. 최종 XML 문서 조립
  const xmlString = `<?xml version="1.0" encoding="EUC-KR"?>
<SABANG_CS_ANS_REGI>
    <HEADER>
        <SEND_COMPAYNY_ID>${SABANGNET_ID}</SEND_COMPAYNY_ID>
        <SEND_AUTH_KEY>${SABANGNET_API_KEY}</SEND_AUTH_KEY>
        <SEND_DATE>${sendDate}</SEND_DATE>
    </HEADER>${dataXml}
</SABANG_CS_ANS_REGI>`;

  // 4. 사방넷이 읽을 수 있게 EUC-KR로 변환해서 리턴!
  const encodedBuffer = iconv.encode(xmlString, 'euc-kr');
  return new NextResponse(new Uint8Array(encodedBuffer), {
    headers: {
      'Content-Type': 'application/xml; charset=euc-kr',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}