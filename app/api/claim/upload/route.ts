import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import sharp from 'sharp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { claim_id, photos } = body as { claim_id: string; photos: string[] };

    if (!claim_id || !photos || photos.length === 0) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 });
    }

    if (photos.length > 3) {
      return NextResponse.json({ error: '사진은 최대 3장까지 가능합니다.' }, { status: 400 });
    }

    const publicUrls: string[] = [];

    for (let i = 0; i < photos.length; i++) {
      const base64 = photos[i];
      const buf = Buffer.from(base64, 'base64');

      // sharp로 리사이즈 (최대 1200px, JPEG 80%)
      const processed = await sharp(buf)
        .rotate()
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();

      const fileName = `${claim_id}/${Date.now()}-${i + 1}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('claim-photos')
        .upload(fileName, processed, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        return NextResponse.json({ error: `사진 ${i + 1} 업로드 실패` }, { status: 500 });
      }

      const { data: urlData } = supabase.storage
        .from('claim-photos')
        .getPublicUrl(fileName);

      publicUrls.push(urlData.publicUrl);
    }

    // 구글시트 업데이트
    const spreadsheetId = process.env.CLAIM_SHEET_ID;
    if (spreadsheetId) {
      const sheets = getSheetsClient();

      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: '클레임!B:B',
      });

      const values = res.data.values || [];
      let rowIdx: number | null = null;

      for (let i = 0; i < values.length; i++) {
        if (values[i] && values[i][0] === claim_id) {
          rowIdx = i + 1; // 1-based
          break;
        }
      }

      if (rowIdx) {
        // L열: 사진 URL
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `클레임!L${rowIdx}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[publicUrls.join('\n')]] },
        });

        // M열: 처리상태 → 사진접수
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `클레임!M${rowIdx}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [['사진접수']] },
        });
      }
    }

    return NextResponse.json({ success: true, urls: publicUrls });
  } catch (error: any) {
    console.error('클레임 사진 업로드 에러:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
