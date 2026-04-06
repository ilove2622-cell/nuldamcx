import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // 1. 프론트엔드에서 보낸 데이터(Body) 꺼내기
    const body = await request.json();
    
    // 2. 웹훅 주소 결정 (환경변수가 있으면 우선 사용, 없으면 클라이언트에서 넘긴 값 사용)
    const webhookUrl = process.env.SHEET_WEBHOOK_URL || body.webhookUrl;
    
    if (!webhookUrl) {
      return NextResponse.json({ error: '웹훅(webhookUrl) 주소가 없습니다.' }, { status: 400 });
    }

    // 3. 웹훅 URL만 쏙 빼고, 나머지 데이터만 구글 시트로 전송할 준비
    const { webhookUrl: _, ...data } = body;

    // 4. 구글 시트(앱스 스크립트 웹훅)로 쏘기!
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error('구글 시트 저장에 실패했습니다.');
    }

    return NextResponse.json({ ok: true });

  } catch (err: any) {
    console.error('시트 저장 에러:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}