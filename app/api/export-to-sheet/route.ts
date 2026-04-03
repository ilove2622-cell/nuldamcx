import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(req: Request) {
  // 💡 [수정됨] try 블록 밖에서 변수를 미리 선언해서 catch 블록에서도 읽을 수 있게 만듭니다.
  let requestedDate = '알 수 없는 날짜'; 

  try {
    const body = await req.json();
    const { date, inflow, response, totals } = body;
    
    // 에러 메시지용으로 밖으로 빼둔 변수에 값 할당
    if (date) requestedDate = date; 

    if (!date) {
      return NextResponse.json({ success: false, error: '날짜 데이터가 없습니다.' }, { status: 400 });
    }

    // 1. 구글 인증 세팅 (.env 파일에 등록한 서비스 계정 정보 사용)
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL2,
        private_key: process.env.GOOGLE_PRIVATE_KEY2?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    // 타겟 구글 시트 ID
    const SPREADSHEET_ID = '1vp10Y5Ztwupmf0AhUK0bTEgH701Ye6Opm7qWcz7YzPM';
    
    // 💡 2. 넘어온 날짜(YYYY-MM-DD)를 시트 탭 이름(MM.DD(요일))으로 변환
    const [year, month, day] = date.split('-');
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    
    const weekDays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekDay = weekDays[d.getDay()];
    
    // 최종 시트 탭 이름 생성: "04.03(금)"
    const sheetName = `${month}.${day}(${weekDay})`;

    // 3. D5부터 들어갈 총합 데이터 배열 만들기 (세로 방향 입력이므로 이중 배열 형태)
    const totalValues = totals.map((val: number) => [val]);

    // 4. 한 번의 요청으로 여러 셀(Range)을 동시에 업데이트 (batchUpdate)
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: `'${sheetName}'!D5`, // D5부터 아래로 쭈르륵 입력
            values: totalValues
          },
          {
            range: `'${sheetName}'!L29`, // 유입호 셀
            values: [[inflow]]
          },
          {
            range: `'${sheetName}'!L30`, // 응대콜 셀
            values: [[response]]
          }
        ]
      }
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('구글 시트 내보내기 에러:', error);
    
    // 시트 탭 이름을 찾을 수 없는 경우 친절하게 에러 메시지 반환
    if (error.message && error.message.includes('Unable to parse range')) {
      return NextResponse.json({ 
        success: false, 
        error: `[${requestedDate}]에 해당하는 탭을 찾을 수 없습니다. 시트 하단에 탭 이름이 'MM.DD(요일)' 형식인지 확인해주세요.` 
      }, { status: 400 });
    }
    
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}