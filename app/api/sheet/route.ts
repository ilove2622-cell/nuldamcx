import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // 💡 프론트에서 보낸 targetDate 추가로 받기
    const { channel, orderNumber, customerName, tel, address, trackingNumber, targetDate } = body;

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '1-xT0UthGXZPCNN6ZtxZz-fYuUnnUblTEnmTz1dFC5jM';

    let tabName = '';

    // 💡 프론트에서 계산한 날짜(YYYY-MM-DD)가 넘어왔다면 우선적으로 사용
    if (targetDate) {
      const [yyyy, mm, dd] = targetDate.split('-');
      tabName = `${mm}${dd}`; // 예: "0408"
    } else {
      // 💡 넘어온 게 없다면 서버 기준 오늘 날짜 계산 (기존 유지)
      const now = new Date();
      const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
      const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(kst.getUTCDate()).padStart(2, '0');
      tabName = `${mm}${dd}`; 
    }

    const getRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!B:B`, 
    });
    
    const numRows = getRes.data.values ? getRes.data.values.length : 0;
    const nextRow = Math.max(numRows + 1, 4); 

    const rowData = [
      channel,          // B열: 주문사이트
      orderNumber,      // C열: 주문번호
      customerName,     // D열: 성함
      tel,              // E열: 연락처
      address,          // F열: 주소
      "1",              // G열: 건수
      "",               // H열: 상품명
      "",               // I열: 문의내용
      trackingNumber,   // J열: 특이사항 (운송장 번호)
      "",               // K열: 비고
      ""                // L열: 담당자
    ];

    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!B${nextRow}:L${nextRow}`, 
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowData],
      },
    });

    return NextResponse.json({ success: true, data: response.data });
  } catch (error: any) {
    console.error('시트 저장 에러:', error);
    if (error.message && error.message.includes('Unable to parse range')) {
       return NextResponse.json({ success: false, error: 'TODAY_TAB_MISSING' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}