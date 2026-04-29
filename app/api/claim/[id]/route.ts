import { NextResponse } from 'next/server';
import { google } from 'googleapis';

function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

// 시트 열 구조 (A~N):
// A:접수일시 | B:Claim ID | C:주문사이트 | D:주문번호 | E:수취인명
// F:수취인전화번호 | G:주소 | H:주문상품 | I:송장번호
// J:유형 | K:처리요청 | L:사진URL | M:처리상태 | N:비고

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: claimId } = await params;

  try {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.CLAIM_SHEET_ID;

    if (!spreadsheetId) {
      return NextResponse.json({ error: 'CLAIM_SHEET_ID not configured' }, { status: 500 });
    }

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: '클레임!A:N',
    });

    const rows = res.data.values || [];
    const row = rows.find((r) => r.length >= 2 && r[1] === claimId);

    if (!row) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }

    const safe = (idx: number) => (row.length > idx ? row[idx] : '');

    return NextResponse.json({
      claim: {
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
      },
    });
  } catch (error: any) {
    console.error('클레임 조회 에러:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
