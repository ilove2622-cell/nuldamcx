-- Phase 1.4: Atomic AI response upsert (이전 미발송 초안 삭제 + 새 초안 삽입)
CREATE OR REPLACE FUNCTION upsert_ai_response(
  p_session_id BIGINT,
  p_message_id BIGINT,
  p_model TEXT,
  p_prompt TEXT,
  p_answer TEXT,
  p_confidence REAL,
  p_category TEXT,
  p_escalate BOOLEAN,
  p_reason TEXT,
  p_mode TEXT,
  p_sent_at TIMESTAMPTZ DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  new_id BIGINT;
BEGIN
  -- 이전 미발송 초안 삭제
  DELETE FROM ai_responses
    WHERE session_id = p_session_id AND sent_at IS NULL;

  -- 새 응답 삽입
  INSERT INTO ai_responses (session_id, message_id, model, prompt, answer, confidence, category, escalate, reason, mode, sent_at)
  VALUES (p_session_id, p_message_id, p_model, p_prompt, p_answer, p_confidence, p_category, p_escalate, p_reason, p_mode, p_sent_at)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql;
