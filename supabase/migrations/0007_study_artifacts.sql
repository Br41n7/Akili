-- Generated study material per project: study guides and slide decks now; mind maps,
-- knowledge graphs and concept battles later (the kind list is ready for them).
-- One generic table instead of one per feature. Content is JSONB, validated by the app.

CREATE TABLE IF NOT EXISTS study_artifacts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('study_guide', 'slide_deck', 'mind_map', 'knowledge_graph', 'concept_battle')),
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS study_artifacts_project_idx
  ON study_artifacts (user_id, project_id, kind, created_at DESC);

ALTER TABLE study_artifacts ENABLE ROW LEVEL SECURITY;

-- Own rows only. An insert must also point at one of the user's own projects.
DROP POLICY IF EXISTS "study_artifacts_select_own" ON study_artifacts;
CREATE POLICY "study_artifacts_select_own" ON study_artifacts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "study_artifacts_insert_own" ON study_artifacts;
CREATE POLICY "study_artifacts_insert_own" ON study_artifacts
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "study_artifacts_update_own" ON study_artifacts;
CREATE POLICY "study_artifacts_update_own" ON study_artifacts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "study_artifacts_delete_own" ON study_artifacts;
CREATE POLICY "study_artifacts_delete_own" ON study_artifacts
  FOR DELETE USING (auth.uid() = user_id);
