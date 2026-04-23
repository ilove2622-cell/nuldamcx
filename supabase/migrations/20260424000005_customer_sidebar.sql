-- 고객 사이드바용 테이블

-- 고객 프로필
CREATE TABLE IF NOT EXISTS customer_profiles (
  id            BIGSERIAL PRIMARY KEY,
  customer_id   TEXT NOT NULL UNIQUE,
  name          TEXT,
  phone         TEXT,
  email         TEXT,
  member_id     TEXT,
  last_visit    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 고객 태그 (카테고리별 색상)
CREATE TABLE IF NOT EXISTS customer_tags (
  id            BIGSERIAL PRIMARY KEY,
  customer_id   TEXT NOT NULL,
  label         TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT '일반',
  color         TEXT NOT NULL DEFAULT '#3b82f6',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_tags_cid ON customer_tags(customer_id);

-- 세션 내부 메모
CREATE TABLE IF NOT EXISTS session_notes (
  id            BIGSERIAL PRIMARY KEY,
  session_id    BIGINT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  text          TEXT NOT NULL,
  author        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_session_notes_sid ON session_notes(session_id);
