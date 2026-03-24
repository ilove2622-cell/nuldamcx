import { NextResponse } from 'next/server';
import iconv from 'iconv-lite';

function getKSTDateString(offsetDays = 0) {
  const now = new Date();
  const kstTime = now.getTime() + (9 * 60 * 60 * 1000);
  const targetDate = new Date(kstTime + (offsetDays * 24 * 60 * 60 * 1000));

  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');

  return `${yyyy}${mm}${dd}`;
}

export async function GET() {
  const SABANGNET_ID = process.env.SABANGNET_ID || '';
  const SABANGNET_API_KEY = process.env.SABANGNET_API_KEY || '';

  if (!SABANGNET_ID || !SABANGNET_API_KEY) {
    console.error('[sabangnet-req-unanswered] 환경변수 누락: SABANGNET_ID 또는 SABANGNET_API_KEY');
    return new NextResponse("Missing Environment Variables", { status: 500 });
  }

  const sendDate = getKSTDateString(0);
  const csStDate = getKSTDateString(-30);

  console.log(`[sabangnet-req-unanswered] 조회 기간: ${csStDate} ~ ${sendDate}`);
  console.log(`[sabangnet-req-unanswered] SABANGNET_ID: ${SABANGNET_ID}`);

  // CS_STATUS 제거 → NULL(전체) 조회
  // 001(신규접수), 002(답변저장) 모두 포함되어야 미답변을 빠짐없이 수집 가능
  const xmlString = `<?xml version="1.0" encoding="EUC-KR"?>
<SABANG_CS_LIST>
    <HEADER>
        <SEND_COMPAYNY_ID>${SABANGNET_ID}</SEND_COMPAYNY_ID>
        <SEND_AUTH_KEY>${SABANGNET_API_KEY}</SEND_AUTH_KEY>
        <SEND_DATE>${sendDate}</SEND_DATE>
    </HEADER>
    <DATA>
        <CS_ST_DATE>${csStDate}</CS_ST_DATE>
        <CS_ED_DATE>${sendDate}</CS_ED_DATE>
    </DATA>
</SABANG_CS_LIST>`;

  console.log(`[sabangnet-req-unanswered] 생성된 XML:\n${xmlString}`);

  const encodedBuffer = iconv.encode(xmlString, 'euc-kr');
  const body = new Uint8Array(encodedBuffer);

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/xml; charset=euc-kr',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}