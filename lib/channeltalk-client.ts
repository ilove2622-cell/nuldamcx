import crypto from 'crypto';

const BASE_URL = 'https://api.channel.io/open/v5';
const ACCESS_KEY = process.env.CHANNELTALK_ACCESS_KEY || '';
const ACCESS_SECRET = process.env.CHANNELTALK_ACCESS_SECRET || '';
const CHANNEL_ID = process.env.CHANNELTALK_CHANNEL_ID || '';
const WEBHOOK_TOKEN = process.env.CHANNELTALK_WEBHOOK_TOKEN || '';

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Access-Key': ACCESS_KEY,
    'X-Access-Secret': ACCESS_SECRET,
  };
}

/** 유저챗에 봇 메시지 발송 */
export async function sendMessage(userChatId: string, text: string) {
  const res = await fetch(`${BASE_URL}/user-chats/${userChatId}/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      blocks: [{ type: 'text', value: text }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`sendMessage failed (${res.status}): ${body}`);
  }
  return res.json();
}

/** 봇 배정 (자동응답 모드) */
export async function assignToBot(userChatId: string) {
  const res = await fetch(`${BASE_URL}/user-chats/${userChatId}/assign-to-bot`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`assignToBot failed (${res.status}): ${body}`);
  }
  return res.json();
}

/** 봇 배정 해제 (상담사에게 넘기기) */
export async function unassignFromBot(userChatId: string) {
  const res = await fetch(`${BASE_URL}/user-chats/${userChatId}/unassign-from-bot`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`unassignFromBot failed (${res.status}): ${body}`);
  }
  return res.json();
}

/** 유저챗에 태그 추가 */
export async function addTag(userChatId: string, tag: string) {
  const res = await fetch(`${BASE_URL}/user-chats/${userChatId}/tags`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ tag }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.warn(`addTag failed (${res.status}): ${body}`);
  }
}

/** 내부 메모(노트) 추가 */
export async function addNote(userChatId: string, text: string) {
  const res = await fetch(`${BASE_URL}/user-chats/${userChatId}/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      blocks: [{ type: 'text', value: text }],
      options: ['private'],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.warn(`addNote failed (${res.status}): ${body}`);
  }
}

/** 유저챗 정보 조회 (채널 유형 등) */
export async function getUserChat(userChatId: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/user-chats/${userChatId}`, {
    method: 'GET',
    headers: authHeaders(),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.userChat || null;
}

/** 채널톡 private 파일의 signed download URL 발급 (15분 유효) */
export async function getSignedFileUrl(userChatId: string, fileKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${BASE_URL}/user-chats/${userChatId}/messages/file?key=${encodeURIComponent(fileKey)}`,
      { method: 'GET', headers: authHeaders() },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json.result || null;
  } catch {
    return null;
  }
}

/** 웹훅 HMAC-SHA256 서명 검증 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (!WEBHOOK_TOKEN || !signature) return false;
  try {
    const expected = crypto
      .createHmac('sha256', WEBHOOK_TOKEN)
      .update(rawBody)
      .digest('base64');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
