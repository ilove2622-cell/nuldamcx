-- Phase 4.1: 앱 설정 테이블 (dryrun/live 토글 등)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 기본 설정 삽입
INSERT INTO app_settings (key, value) VALUES
  ('auto_reply_mode', '"dryrun"'),
  ('confidence_threshold', '0.8')
ON CONFLICT (key) DO NOTHING;
