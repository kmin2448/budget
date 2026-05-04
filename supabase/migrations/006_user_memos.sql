-- ============================================================
-- 사용자 메모 테이블 추가
-- ============================================================

CREATE TABLE IF NOT EXISTS user_memos (
  user_email TEXT PRIMARY KEY,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_memos ENABLE ROW LEVEL SECURITY;

-- 서비스 롤(앱 서버)이 RLS 우회하여 읽기/쓰기하므로
-- 일반 클라이언트용 읽기 정책만 추가
CREATE POLICY "user_memos_select_own" ON user_memos
  FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_user_memos_email ON user_memos(user_email);
