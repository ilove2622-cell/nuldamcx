// 공유 타입 정의 — chat/page.tsx, chat/console/page.tsx 양쪽에서 사용

export interface Session {
  id: number;
  user_chat_id: string;
  channel_type: string;
  customer_id?: string | null;
  customer_name: string | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  last_message_at: string | null;
  last_message_text: string | null;
  summary?: string | null;
  assigned_agent?: string | null;
  assigned_agent_name?: string | null;
  tags?: string[] | null;
  snoozed_until?: string | null;
}

export interface Message {
  id: number;
  session_id: number;
  sender: string;
  message_id?: string | null;
  text: string;
  created_at: string;
  idempotency_key?: string | null;
  _optimistic?: boolean; // 낙관적 업데이트 표시
}

export interface AIResponse {
  id: number;
  session_id: number;
  message_id?: number | null;
  model?: string;
  prompt?: string;
  answer: string;
  confidence: number;
  category: string;
  escalate: boolean;
  reason: string;
  mode: string;
  sent_at: string | null;
  created_at: string;
}

export interface Escalation {
  id: number;
  session_id: number;
  reason: string;
  category: string;
  created_at: string;
}

export type TabKey = '전체' | '응대중' | '대기중' | '종료' | '중요';

export type SortKey = 'last_message_at_desc' | 'last_message_at_asc' | 'created_at_desc';

export type Category =
  | '주문조회' | '배송' | '환불' | '교환' | '취소'
  | '클레임' | '상품문의' | '기타';

// 메시지 블록 파싱 (Phase 3.6)
export type MessageBlock =
  | { type: 'text'; content: string }
  | { type: 'image'; url: string }
  | { type: 'photo'; chatId: string; fileId: string; dims: string; name: string }
  | { type: 'video-url'; url: string }
  | { type: 'video'; chatId: string; fileId: string; duration: string; name: string }
  | { type: 'file'; chatId: string; fileId: string; size: string; name: string };

// ─── 고객 사이드바 ───

export interface CustomerProfile {
  id: number;
  customer_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  member_id: string | null;
  last_visit: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerTag {
  id: number;
  customer_id: string;
  label: string;
  category: string;
  color: string;
  created_at: string;
}

export interface SessionTag {
  id: number;
  session_id: number;
  label: string;
  category: string;
  color: string;
  created_at: string;
}

export interface SessionNote {
  id: number;
  session_id: number;
  text: string;
  author: string | null;
  created_at: string;
}

export interface FileAttachment {
  type: 'image' | 'photo' | 'video-url' | 'video' | 'file';
  name: string;
  url?: string;
  messageId: number;
  createdAt: string;
}
