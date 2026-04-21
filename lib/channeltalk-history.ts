/**
 * 채널톡 과거 상담 히스토리 수집 모듈
 * - 유저챗 목록 조회 (페이지네이션)
 * - 개별 채팅 메시지 조회
 * - 고객 질문 → 매니저 응답 쌍(Q&A pair) 추출
 */

const BASE_URL = 'https://api.channel.io/open/v5';
const ACCESS_KEY = process.env.CHANNELTALK_ACCESS_KEY || '';
const ACCESS_SECRET = process.env.CHANNELTALK_ACCESS_SECRET || '';

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Access-Key': ACCESS_KEY,
    'X-Access-Secret': ACCESS_SECRET,
  };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface QAPair {
  customerText: string;
  managerResponse: string;
  userChatId: string;
  channelType: string | null;
  chatCreatedAt: string | null;
}

/**
 * 유저챗 목록 조회 (closed 상태)
 * @returns { chats, next } — next가 없으면 마지막 페이지
 */
export async function fetchUserChats(
  state: string = 'closed',
  cursor?: string,
  limit: number = 20
): Promise<{ chats: any[]; next?: string }> {
  const params = new URLSearchParams({
    state,
    limit: String(limit),
    sortOrder: 'desc',
  });
  if (cursor) params.set('since', cursor);

  const res = await fetch(`${BASE_URL}/user-chats?${params}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`fetchUserChats failed (${res.status}): ${body}`);
  }
  const json = await res.json();
  return {
    chats: json.userChats || [],
    next: json.next || undefined,
  };
}

/**
 * 특정 유저챗의 메시지 목록 조회
 */
export async function fetchMessages(userChatId: string): Promise<any[]> {
  const allMessages: any[] = [];
  let cursor: string | undefined;

  // 최대 5페이지 (대부분의 상담은 이 안에 끝남)
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({ limit: '50', sortOrder: 'asc' });
    if (cursor) params.set('since', cursor);

    const res = await fetch(
      `${BASE_URL}/user-chats/${userChatId}/messages?${params}`,
      { headers: authHeaders() }
    );
    if (!res.ok) break;

    const json = await res.json();
    const msgs = json.messages || [];
    if (msgs.length === 0) break;

    allMessages.push(...msgs);
    if (!json.next) break;
    cursor = json.next;
    await delay(200);
  }

  return allMessages;
}

/**
 * 메시지 배열에서 고객 질문 → 매니저 응답 쌍 추출
 * - 봇/시스템 메시지 제외
 * - 짧은 메시지 필터링 (고객 10자 미만, 매니저 20자 미만)
 */
export function extractQAPairs(
  messages: any[],
  userChatId: string,
  channelType: string | null,
  chatCreatedAt: string | null
): QAPair[] {
  const pairs: QAPair[] = [];

  // 메시지에서 텍스트 추출
  function extractText(msg: any): string | null {
    if (!msg) return null;
    // blocks 형태
    if (msg.blocks && Array.isArray(msg.blocks)) {
      return msg.blocks
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.value || '')
        .join('\n')
        .trim();
    }
    // plainText 형태
    if (msg.plainText) return msg.plainText.trim();
    return null;
  }

  // 발신자 분류 — 봇도 responder로 포함
  function getSender(msg: any): 'customer' | 'responder' | 'other' {
    const personType = msg.personType || '';
    if (personType === 'user') return 'customer';
    if (personType === 'manager' || personType === 'bot') return 'responder';
    return 'other';
  }

  // 연속된 고객 메시지를 모아서 하나로, 다음 응답(매니저/봇)과 매칭
  let customerBuffer: string[] = [];

  for (const msg of messages) {
    const sender = getSender(msg);
    const text = extractText(msg);
    if (!text) continue;

    if (sender === 'customer') {
      customerBuffer.push(text);
    } else if (sender === 'responder' && customerBuffer.length > 0) {
      const customerText = customerBuffer.join('\n');
      const response = text;

      // "담당자와 연결" / "상담 운영시간이 아닙니다" 등 에스컬레이션 안내는 제외
      const isEscalationOnly =
        response.includes('담당자와 연결') ||
        response.includes('상담 운영시간이 아닙니다');

      // 짧은 메시지 필터링 + 에스컬레이션 전용 응답 제외
      if (customerText.length >= 10 && response.length >= 20 && !isEscalationOnly) {
        pairs.push({
          customerText,
          managerResponse: response,
          userChatId,
          channelType,
          chatCreatedAt,
        });
      }
      customerBuffer = [];
    } else if (sender === 'responder') {
      // 응답자가 먼저 보낸 경우 무시
      continue;
    }
  }

  return pairs;
}
