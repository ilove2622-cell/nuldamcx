import { NextResponse } from 'next/server';

const AICC_URL = process.env.AICC_SERVER_URL || '';

export async function GET() {
  if (!AICC_URL) {
    return NextResponse.json({ status: 'not_configured', message: 'AICC_SERVER_URL 미설정' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(AICC_URL, { signal: controller.signal });
    clearTimeout(timeout);

    const data = await res.json();
    return NextResponse.json({ status: 'online', ...data });
  } catch (error: any) {
    return NextResponse.json({
      status: 'offline',
      message: error.name === 'AbortError' ? '응답 시간 초과 (5초)' : error.message,
    });
  }
}
