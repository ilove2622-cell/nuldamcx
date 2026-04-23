-- 대기중(snoozed) 상태 지원
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_chat_sessions_snoozed ON chat_sessions(snoozed_until) WHERE snoozed_until IS NOT NULL;
