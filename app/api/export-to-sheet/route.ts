import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { date, inflow, response, totals } = body;

    if (!date) {
      return NextResponse.json({ success: false, error: '날짜 데이터가 없습니다.' }, { status: 400 });
    }

    // 1. 구글 인증 세팅 (새로 발급받은 EMAIL2, PRIVATE_KEY2 사용)
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    // 💡 [참조 반영] 변수명을 spreadsheetId로 통일
    const spreadsheetId = '1vp10Y5Ztwupmf0AhUK0bTEgH701Ye6Opm7qWcz7YzPM';
    
    // 💡 2. 넘어온 날짜(YYYY-MM-DD)를 시트 탭 이름(MMDD)으로 변환
    const [year, month, day] = date.split('-');
    
    // 최종 시트 탭 이름 생성: "0403"
    const tabName = `${month}${day}`;

    // 3. D5부터 들어갈 총합 데이터 배열 만들기 (세로 방향 입력이므로 이중 배열 형태)
    const totalValues = totals.map((val: number) => [val]);

    // 4. 한 번의 요청으로 여러 셀(Range)을 동시에 업데이트 (batchUpdate)
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

    // 💡 [참조 반영] 성공 시 response.data 반환
    return NextResponse.json({ success: true, data: res.data });

  } catch (error: any) {
    console.error('구글 시트 내보내기 에러:', error);
    
    // 💡 [참조 반영] 프론트엔드에서 예외 처리를 쉽게 할 수 있도록 'TODAY_TAB_MISSING' 코드로 통일
    if (error.message && error.message.includes('Unable to parse range')) {
      return NextResponse.json({ success: false, error: 'TODAY_TAB_MISSING' }, { status: 400 });
    }
    
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}