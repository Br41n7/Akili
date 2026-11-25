-- 0018: Ask AI keeps its conversation per project, so it is still there after a refresh.
-- Each row is one message. A learner can read, add and delete only their own rows (same rule as notes).
-- Safe to run more than once. Run after 0017.

CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'ai')),
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 30000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_messages_project_idx ON chat_messages (user_id, project_id, created_at DESC);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_messages_own" ON chat_messages;
CREATE POLICY "chat_messages_own" ON chat_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
