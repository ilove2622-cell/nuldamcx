-- 채널톡 자동응답 테이블
-- chat_sessions: 채팅 세션 (유저챗 단위)
CREATE TABLE IF NOT EXISTS chat_sessions (
  id            BIGSERIAL PRIMARY KEY,
  user_chat_id  TEXT NOT NULL UNIQUE,        -- 채널톡 userChat.id
  channel_type  TEXT,                         -- appKakao | appNaverTalk | native
  customer_id   TEXT,                         -- 채널톡 user.id
  customer_name TEXT,
  status        TEXT NOT NULL DEFAULT 'open', -- open | closed | escalated
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_chat_id ON chat_sessions(user_chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);

-- chat_messages: 개별 메시지 기록
CREATE TABLE IF NOT EXISTS chat_messages (
  id          BIGSERIAL PRIMARY KEY,
  session_id  BIGINT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  sender      TEXT NOT NULL,                  -- customer | bot | manager
  message_id  TEXT,                           -- 채널톡 message.id
  text        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);

-- ai_responses: LLM 응답 기록 (드라이런/라이브 모드 구분)
CREATE TABLE IF NOT EXISTS ai_responses (
  id          BIGSERIAL PRIMARY KEY,
  message_id  BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
  session_id  BIGINT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  model       TEXT NOT NULL,                  -- gemini-2.5-flash 등
  prompt      TEXT,
  answer      TEXT,
  confidence  REAL,                           -- 0.0 ~ 1.0
  category    TEXT,                           -- 주문조회|배송|환불|교환|취소|클레임|상품문의|기타
  escalate    BOOLEAN DEFAULT FALSE,
  reason      TEXT,                           -- 에스컬레이션 사유
  mode        TEXT NOT NULL DEFAULT 'dryrun', -- dryrun | live
  sent_at     TIMESTAMPTZ,                   -- 실제 발송 시각 (dryrun이면 NULL)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_responses_session_id ON ai_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_responses_mode ON ai_responses(mode);

-- escalations: 에스컬레이션 기록
CREATE TABLE IF NOT EXISTS escalations (
  id          BIGSERIAL PRIMARY KEY,
  session_id  BIGINT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  category    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escalations_session_id ON escalations(session_id);
