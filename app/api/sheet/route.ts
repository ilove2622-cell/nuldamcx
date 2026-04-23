import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getSheetTargetDate } from '@/lib/business-hours';

export async function POST(req: Request) {
  try {
    const body = await req.json();
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

    // 영업일 기준 대상 날짜 계산 (15:30 이후 → 다음 영업일, 주말/공휴일 → 다음 영업일)
    const resolvedDate = targetDate || getSheetTargetDate();
    const [, mm, dd] = resolvedDate.split('-');
    const tabName = `${mm}${dd}`;

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