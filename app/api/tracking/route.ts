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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function fetchCJ(num: string) {
  const url = `https://trace.cjlogistics.com/next/tracking.html?wblNo=${num}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();

  // 배송 상태 파싱
  const steps: { date: string; location: string; status: string }[] = [];

  // 테이블 행 파싱 (정규식)
  const rowRegex = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const date = match[1].replace(/<[^>]+>/g, '').trim();
    const location = match[2].replace(/<[^>]+>/g, '').trim();
    const status = match[3].replace(/<[^>]+>/g, '').trim();
    if (date && date.match(/\d{4}/)) {
      steps.push({ date, location, status });
    }
  }

  // 현재 상태 감지
  let currentStatus = '조회중';
  if (html.includes('배달완료') || html.includes('배달 완료')) currentStatus = '배달완료';
  else if (html.includes('배송출발')) currentStatus = '배송출발';
  else if (html.includes('상품이동중')) currentStatus = '상품이동중';
  else if (html.includes('상품접수')) currentStatus = '상품접수';

  return NextResponse.json({
    carrier: 'CJ대한통운',
    trackingNumber: num,
    currentStatus,
    steps: steps.slice(0, 20),
  });
}

async function fetchLotte(num: string) {
  const url = `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${num}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();

  const steps: { date: string; location: string; status: string }[] = [];

  // 테이블 행 파싱
  const rowRegex = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const col1 = match[1].replace(/<[^>]+>/g, '').trim();
    const col2 = match[2].replace(/<[^>]+>/g, '').trim();
    const col3 = match[3].replace(/<[^>]+>/g, '').trim();
    if (col1 && col1.match(/\d{4}/)) {
      steps.push({ date: col1, location: col2, status: col3 });
    }
  }

  let currentStatus = '조회중';
  if (html.includes('배달완료') || html.includes('물품을 받으셨습니다')) currentStatus = '배달완료';
  else if (html.includes('배송출발') || html.includes('배달준비중')) currentStatus = '배송출발';
  else if (html.includes('상품이동중') || html.includes('화물이동중')) currentStatus = '상품이동중';
  else if (html.includes('상품접수') || html.includes('화물접수')) currentStatus = '상품접수';

  return NextResponse.json({
    carrier: '롯데택배',
    trackingNumber: num,
    currentStatus,
    steps: steps.slice(0, 20),
  });
}
