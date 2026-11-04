-- 0015: figures saved from a learner's own materials
--
-- A learner picks pictures found inside a PDF, slide deck or Word file they uploaded. Each is saved as a small image in a
-- PRIVATE storage bucket and described by one row here. Nothing is public: the server hands out short-lived links.
-- Rows are written only by the server (service role) after checks on plan limit, file type and size.
-- plans: adds a 'max_figures' limit (Free 10, Pro 200), editable in /admin/plans.
-- Safe to run more than once. Run after 0014.

CREATE TABLE IF NOT EXISTS figures (
  id            UUID PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL UNIQUE,
  source_name   TEXT,
  page          INTEGER,
  caption       TEXT CHECK (caption IS NULL OR char_length(caption) <= 300),
  bytes         INTEGER NOT NULL CHECK (bytes > 0 AND bytes <= 500000),
  explanation   JSONB,
  explained_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS figures_project_idx ON figures (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS figures_user_idx ON figures (user_id);

ALTER TABLE figures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "figures_own_read" ON figures;
CREATE POLICY "figures_own_read" ON figures FOR SELECT USING (auth.uid() = user_id);
-- No insert/update/delete policy: only the server writes.

-- Private bucket, no policies: nobody can read or write it directly with a normal key.
INSERT INTO storage.buckets (id, name, public) VALUES ('figures', 'figures', FALSE) ON CONFLICT (id) DO NOTHING;

UPDATE plans SET limits = limits || '{"max_figures": 10}'::jsonb  WHERE id = 'free' AND NOT (limits ? 'max_figures');
UPDATE plans SET limits = limits || '{"max_figures": 200}'::jsonb WHERE id = 'pro'  AND NOT (limits ? 'max_figures');
