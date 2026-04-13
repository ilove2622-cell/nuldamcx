import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { date, inflow, response, totals } = body;

    if (!date) {
      return NextResponse.json({ success: false, error: '날짜 데이터가 없습니다.' }, { status: 400 });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    const spreadsheetId = '1vp10Y5Ztwupmf0AhUK0bTEgH701Ye6Opm7qWcz7YzPM';
    
    const [year, month, day] = date.split('-');
    
    const tabName = `${month}${day}`;

    const totalValues = totals.map((val: number) => [val]);

    const res = await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: `'${tabName}'!D5`, // D5부터 아래로 쭈르륵 입력
            values: totalValues
          },
          {
            range: `'${tabName}'!L29`, // 유입호 셀
            values: [[inflow]]
          },
          {
            range: `'${tabName}'!L30`, // 응대콜 셀
            values: [[response]]
          }
        ]
      }
    });

    return NextResponse.json({ success: true, data: res.data });

  } catch (error: any) {
    console.error('구글 시트 내보내기 에러:', error);
    
    if (error.message && error.message.includes('Unable to parse range')) {
      return NextResponse.json({ success: false, error: 'TODAY_TAB_MISSING' }, { status: 400 });
    }
    
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}