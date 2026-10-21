-- Akili personal notes enhancements.
-- Run this in Supabase SQL Editor after the existing schema/migrations.

ALTER TABLE notes ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS notes_user_updated_idx
  ON notes(user_id, project_id, updated_at DESC);

CREATE OR REPLACE FUNCTION update_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS notes_updated_at ON notes;
CREATE TRIGGER notes_updated_at
BEFORE UPDATE ON notes
FOR EACH ROW EXECUTE FUNCTION update_notes_updated_at();

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notes_own" ON notes;
CREATE POLICY "notes_own" ON notes
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
