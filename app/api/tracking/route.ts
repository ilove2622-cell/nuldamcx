import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const carrier = searchParams.get('carrier') || 'lotte';
  const trackingNum = searchParams.get('num') || '';

  if (!trackingNum) {
    return NextResponse.json({ error: 'Missing tracking number' }, { status: 400 });
  }

  try {
    if (carrier === 'cj') {
      return await fetchCJ(trackingNum);
    } else {
      return await fetchLotte(trackingNum);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message, carrier: carrier === 'cj' ? 'CJ대한통운' : '롯데택배', trackingNumber: trackingNum, currentStatus: '조회실패', steps: [] }, { status: 200 });
  }
}

async function fetchLotte(num: string) {
  const url = `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${num}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();

  const steps: { step: string; date: string; location: string; detail: string }[] = [];

  // 두 번째 테이블 (배송 이력) 파싱 - 4컬럼: 단계, 시간, 현재위치, 처리상황
  const tableMatch = html.match(/<table[^>]*>[\s\S]*?<\/table>[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/);
  if (tableMatch) {
    const tbody = tableMatch[1];
    const rowRegex = /<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
    let match;
    while ((match = rowRegex.exec(tbody)) !== null) {
      const step = match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      const date = match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      const location = match[3].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      const detail = match[4].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      if (date && date.match(/\d{4}/)) {
        steps.push({ step, date, location, detail });
      }
    }
  }

  // 첫 번째 테이블에서 기본 정보 (발송지, 도착지, 배달상태)
  let sender = '', receiver = '', deliveryStatus = '';
  const firstTableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/);
  if (firstTableMatch) {
    const cells = firstTableMatch[1].match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
    const cleanCells = cells.map(c => c.replace(/<[^>]+>/g, '').trim());
    if (cleanCells.length >= 4) {
      sender = cleanCells[1]; // 발송지
      receiver = cleanCells[2]; // 도착지
      deliveryStatus = cleanCells[3]; // 배달상태
    }
  }

  let currentStatus = deliveryStatus || '조회중';

  return NextResponse.json({
    carrier: '롯데택배',
    trackingNumber: num,
    currentStatus,
    sender,
    receiver,
    steps,
  });
}

async function fetchCJ(num: string) {
  // CJ대한통운 HTML 직접 파싱
  const url = `https://trace.cjlogistics.com/next/tracking.html?wblNo=${num}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();

  const steps: { step: string; date: string; location: string; detail: string }[] = [];

  // CJ는 JS로 데이터 로딩하므로 HTML에서 직접 파싱이 어려움
  // noscript 또는 초기 데이터 확인
  const tbodyMatch = html.match(/id="resultList"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
  if (tbodyMatch) {
    const rowRegex = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
    let match;
    while ((match = rowRegex.exec(tbodyMatch[1])) !== null) {
      const date = match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      const step = match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      const location = match[3].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      const detail = match[4].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      if (date && date.match(/\d/)) {
        steps.push({ step, date, location, detail });
      }
    }
  }

  let currentStatus = '조회중';
  if (html.includes('배달완료')) currentStatus = '배달완료';
  else if (html.includes('배송출발')) currentStatus = '배송출발';
  else if (html.includes('상품이동중')) currentStatus = '상품이동중';
  else if (html.includes('상품접수')) currentStatus = '상품접수';

  return NextResponse.json({
    carrier: 'CJ대한통운',
    trackingNumber: num,
    currentStatus,
    sender: '',
    receiver: '',
    steps,
  });
}
