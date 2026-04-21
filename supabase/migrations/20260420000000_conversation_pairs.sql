-- 과거 상담 데이터 RAG용 테이블
-- conversation_pairs: 고객 질문 → 매니저 응답 쌍
CREATE TABLE IF NOT EXISTS conversation_pairs (
  id               BIGSERIAL PRIMARY KEY,
  user_chat_id     TEXT NOT NULL,
  customer_text    TEXT NOT NULL,
  manager_response TEXT NOT NULL,
  channel_type     TEXT,                          -- appKakao | appNaverTalk | native
  category         TEXT,
  embedding        vector(768),
  chat_created_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_pairs_unique
  ON conversation_pairs(user_chat_id, md5(customer_text));
CREATE INDEX IF NOT EXISTS idx_conversation_pairs_embedding
  ON conversation_pairs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- match_conversations RPC: 기존 match_scripts와 동일 패턴
CREATE OR REPLACE FUNCTION match_conversations(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.4,
  match_count int DEFAULT 2
)
RETURNS TABLE (
  id               bigint,
  customer_text    text,
  manager_response text,
  channel_type     text,
  category         text,
  similarity       float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.id,
    cp.customer_text,
    cp.manager_response,
    cp.channel_type,
    cp.category,
    1 - (cp.embedding <=> query_embedding) AS similarity
  FROM conversation_pairs cp
  WHERE cp.embedding IS NOT NULL
    AND 1 - (cp.embedding <=> query_embedding) > match_threshold
  ORDER BY cp.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- conversation_import_jobs: import 진행상태 추적
CREATE TABLE IF NOT EXISTS conversation_import_jobs (
  id              BIGSERIAL PRIMARY KEY,
  status          TEXT NOT NULL DEFAULT 'running',  -- running | completed | failed
  total_chats     INT DEFAULT 0,
  processed_chats INT DEFAULT 0,
  total_pairs     INT DEFAULT 0,
  cursor          TEXT,                              -- 채널톡 API 페이지네이션 커서
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
