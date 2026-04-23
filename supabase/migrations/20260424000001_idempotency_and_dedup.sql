-- Phase 1.1: 메시지 전송 멱등성
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_idempotency
  ON chat_messages (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Phase 1.4: 웹훅 중복 메시지 방지
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_session_message
  ON chat_messages (session_id, message_id) WHERE message_id IS NOT NULL;
