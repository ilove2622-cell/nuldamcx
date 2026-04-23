-- 상담(세션) 태그 테이블
CREATE TABLE IF NOT EXISTS session_tags (
  id            BIGSERIAL PRIMARY KEY,
  session_id    BIGINT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT '일반',
  color         TEXT NOT NULL DEFAULT '#3b82f6',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_session_tags_sid ON session_tags(session_id);
