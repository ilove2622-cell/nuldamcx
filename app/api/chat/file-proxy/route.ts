import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ACCESS_KEY = process.env.CHANNELTALK_ACCESS_KEY || '';
const ACCESS_SECRET = process.env.CHANNELTALK_ACCESS_SECRET || '';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/chat/file-proxy?chatId=xxx&fileId=yyy
 * 채널톡 파일을 Supabase Storage에 캐시하고 공개 URL로 리다이렉트
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const chatId = sp.get('chatId');
  const fileId = sp.get('fileId');

  if (!chatId || !fileId) {
    return NextResponse.json({ error: 'chatId, fileId required' }, { status: 400 });
  }

  // 1. 이미 Storage에 있으면 바로 리다이렉트
  const ext = 'jpg'; // default
  const possibleExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov'];
  for (const e of possibleExts) {
    const path = `${chatId}/${fileId}.${e}`;
    const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(path);
    // Check if file exists by trying to fetch head
    try {
      const headRes = await fetch(urlData.publicUrl, { method: 'HEAD' });
      if (headRes.ok) {
        return NextResponse.redirect(urlData.publicUrl);
      }
    } catch { /* continue */ }
  }

  // 2. 채널톡 API로 메시지에서 파일 메타데이터 조회
  try {
    const msgRes = await fetch(
      `https://api.channel.io/open/v5/user-chats/${chatId}/messages?sortOrder=desc&limit=50`,
      {
        headers: {
          'X-Access-Key': ACCESS_KEY,
          'X-Access-Secret': ACCESS_SECRET,
        },
      }
    );

    if (!msgRes.ok) {
      return NextResponse.json({ error: 'Channel Talk API error' }, { status: 502 });
    }

    const data = await msgRes.json();
    const messages = data.messages || [];

    // 파일 찾기
    let targetFile: any = null;
    for (const msg of messages) {
      for (const f of (msg.files || [])) {
        if (f.id === fileId) {
          targetFile = f;
          break;
        }
      }
      if (targetFile) break;
    }

    if (!targetFile || !targetFile.bucket || !targetFile.key) {
      return NextResponse.json({ error: 'File not found in messages' }, { status: 404 });
    }

    // 3. CDN에서 다운로드 시도
    const fileExt = targetFile.name?.split('.').pop() || 'jpg';
    const sourceUrl = `https://${targetFile.bucket}/${targetFile.key}`;
    const fileRes = await fetch(sourceUrl);

    if (!fileRes.ok) {
      // 다운로드 실패 시 채널톡 데스크로 리다이렉트
      return NextResponse.redirect(
        `https://desk.channel.io/#/channels/35237/user_chats/${chatId}`
      );
    }

    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const storagePath = `${chatId}/${fileId}.${fileExt}`;

    // 4. Supabase Storage��� 캐시
    await supabase.storage.from('chat-images').upload(storagePath, buffer, {
      contentType: targetFile.contentType || 'image/jpeg',
      upsert: true,
    });

    const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(storagePath);
    return NextResponse.redirect(urlData.publicUrl);
  } catch (err: any) {
    console.error('File proxy error:', err.message);
    return NextResponse.redirect(
      `https://desk.channel.io/#/channels/35237/user_chats/${chatId}`
    );
  }
}
