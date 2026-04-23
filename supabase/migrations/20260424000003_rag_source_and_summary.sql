-- Phase 4.3: RAG 중복 제거 - conversation_pairs에 source 컬럼 추가
ALTER TABLE conversation_pairs ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manager';

-- Phase 4.5: 대화 요약
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS summary TEXT;

-- Phase 2.1: 페이지네이션 인덱스
CREATE INDEX IF NOT EXISTS idx_chat_sessions_last_message
  ON chat_sessions (last_message_at DESC NULLS LAST);
