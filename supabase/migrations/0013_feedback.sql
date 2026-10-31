-- 0013: learner feedback and ratings
--
-- One table for both: a written message (kind general / bug / idea) or a quick rating (kind rating, 1 = not helpful, 5 = helpful).
-- `context` says where it came from (e.g. 'lesson', 'quiz', 'app'); `ref` is an optional id such as a lesson id (never lesson text).
-- Rows are written only by the server (service role) after validation and rate limiting. Learners can read their own.
-- Admins read everything through /admin/feedback. Safe to run more than once. Run after 0012.

CREATE TABLE IF NOT EXISTS feedback (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,   -- feedback is kept if the account is deleted
  kind        TEXT NOT NULL CHECK (kind IN ('general', 'bug', 'idea', 'rating')),
  rating      SMALLINT CHECK (rating BETWEEN 1 AND 5),
  message     TEXT CHECK (message IS NULL OR char_length(message) <= 2000),
  context     TEXT NOT NULL DEFAULT 'app',
  ref         TEXT,
  page        TEXT,
  plan_id     TEXT,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'done')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_user_idx ON feedback (user_id, created_at DESC);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feedback_own_read" ON feedback;
CREATE POLICY "feedback_own_read" ON feedback FOR SELECT USING (auth.uid() = user_id);
-- No insert/update/delete policy: only the server writes.
