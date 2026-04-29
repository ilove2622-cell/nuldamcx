import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// 시트 열 구조 (A~N):
// A:접수일시 | B:Claim ID | C:주문사이트 | D:주문번호 | E:수취인명
// F:수취인전화번호 | G:주소 | H:주문상품 | I:송장번호
// J:유형 | K:처리요청 | L:사진URL | M:처리상태 | N:비고

function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

export async function GET() {
  try {
    const spreadsheetId = process.env.CLAIM_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: 'CLAIM_SHEET_ID not configured' }, { status: 500 });
    }

    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: '클레임!A:N',
    });

    const rows = res.data.values || [];
    // 첫 행은 헤더일 수 있으므로 skip (Claim ID가 CLM-으로 시작하지 않는 행)
    const claims = rows
      .filter((row) => row.length >= 2 && row[1]?.startsWith('CLM-'))
      .map((row) => {
        const safe = (idx: number) => (row.length > idx ? row[idx] : '');
        return {
          created_at: safe(0),
          claim_id: safe(1),
          mall_name: safe(2),
          order_number: safe(3),
          receiver_name: safe(4),
          receiver_phone: safe(5),
          receiver_addr: safe(6),
          product_name: safe(7),
          tracking_number: safe(8),
          claim_type: safe(9),
          resolution: safe(10),
          photo_urls: safe(11),
          status: safe(12),
          note: safe(13),
        };
      })
      .reverse(); // 최신순

    return NextResponse.json({ claims });
  } catch (error: any) {
    console.error('클레임 목록 조회 에러:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: 처리상태/비고 업데이트
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { claim_id, status, note } = body as { claim_id: string; status?: string; note?: string };

    const spreadsheetId = process.env.CLAIM_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: 'CLAIM_SHEET_ID not configured' }, { status: 500 });
    }

    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: '클레임!B:B',
    });

    const values = res.data.values || [];
    let rowIdx: number | null = null;
    for (let i = 0; i < values.length; i++) {
      if (values[i] && values[i][0] === claim_id) {
        rowIdx = i + 1;
        break;
      }
    }

    if (!rowIdx) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }

    if (status) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `클레임!M${rowIdx}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[status]] },
      });
    }

    if (note !== undefined) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `클레임!N${rowIdx}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[note]] },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('클레임 업데이트 에러:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
