-- 미답변 필터용: 마지막 메시지 발신자 추적
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS last_message_sender TEXT;
-- 기존 세션 backfill: chat_messages에서 마지막 메시지의 sender 가져오기
UPDATE chat_sessions cs
SET last_message_sender = sub.sender
FROM (
  SELECT DISTINCT ON (session_id) session_id, sender
  FROM chat_messages
  ORDER BY session_id, created_at DESC
) sub
WHERE cs.id = sub.session_id AND cs.last_message_sender IS NULL;
