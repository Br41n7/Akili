-- ════════════════════════════════════════════════════════════════
-- AKILI ADAPTIVE LEARNING LAYER
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS learner_concepts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  concept TEXT NOT NULL,
  parent_concept TEXT,
  mastery_score NUMERIC NOT NULL DEFAULT 0.20 CHECK (mastery_score >= 0 AND mastery_score <= 1),
  confidence NUMERIC NOT NULL DEFAULT 0.20 CHECK (confidence >= 0 AND confidence <= 1),
  exposure_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0,
  consecutive_correct INTEGER NOT NULL DEFAULT 0,
  consecutive_incorrect INTEGER NOT NULL DEFAULT 0,
  difficulty_level TEXT NOT NULL DEFAULT 'foundational' CHECK (difficulty_level IN ('foundational','developing','intermediate','advanced')),
  learning_stage TEXT NOT NULL DEFAULT 'unseen' CHECK (learning_stage IN ('unseen','introduced','familiar','developing','proficient','mastered')),
  misconception TEXT,
  last_assessed_at TIMESTAMPTZ,
  last_practiced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, project_id, concept)
);

CREATE TABLE IF NOT EXISTS learning_evidence (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  concept TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('chat','quiz','exam','lesson','practice','flashcard')),
  interaction_type TEXT NOT NULL,
  prompt TEXT,
  learner_response TEXT,
  correctness BOOLEAN,
  confidence NUMERIC CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  difficulty TEXT,
  misconception TEXT,
  evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS learner_concepts_project_idx ON learner_concepts(user_id, project_id);
CREATE INDEX IF NOT EXISTS learner_concepts_mastery_idx ON learner_concepts(user_id, project_id, mastery_score);
CREATE INDEX IF NOT EXISTS learning_evidence_project_idx ON learning_evidence(user_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS learning_evidence_concept_idx ON learning_evidence(user_id, project_id, concept, created_at DESC);

ALTER TABLE learner_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "learner_concepts_own" ON learner_concepts;
CREATE POLICY "learner_concepts_own" ON learner_concepts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "learning_evidence_own" ON learning_evidence;
CREATE POLICY "learning_evidence_own" ON learning_evidence
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_adaptive_concept(
  p_user_id UUID,
  p_project_id UUID,
  p_concept TEXT,
  p_correct BOOLEAN,
  p_misconception TEXT DEFAULT NULL,
  p_difficulty TEXT DEFAULT 'foundational'
) RETURNS learner_concepts AS $$
DECLARE
  r learner_concepts;
  old_score NUMERIC;
  new_score NUMERIC;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO r FROM learner_concepts
  WHERE user_id = p_user_id AND project_id = p_project_id AND lower(concept) = lower(trim(p_concept))
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO learner_concepts (user_id, project_id, concept, mastery_score, confidence, exposure_count, correct_count, incorrect_count, consecutive_correct, consecutive_incorrect, difficulty_level, learning_stage, misconception, last_assessed_at, last_practiced_at)
    VALUES (p_user_id, p_project_id, trim(p_concept), CASE WHEN p_correct THEN 0.55 ELSE 0.15 END, 0.25, 1, CASE WHEN p_correct THEN 1 ELSE 0 END, CASE WHEN p_correct THEN 0 ELSE 1 END, CASE WHEN p_correct THEN 1 ELSE 0 END, CASE WHEN p_correct THEN 0 ELSE 1 END, COALESCE(p_difficulty, 'foundational'), CASE WHEN p_correct THEN 'familiar' ELSE 'introduced' END, p_misconception, NOW(), NOW())
    RETURNING * INTO r;
    RETURN r;
  END IF;

  old_score := r.mastery_score;
  IF p_correct THEN
    new_score := LEAST(1, old_score + (0.10 + LEAST(r.consecutive_correct, 3) * 0.025));
  ELSE
    new_score := GREATEST(0, old_score - 0.14);
  END IF;

  UPDATE learner_concepts SET
    mastery_score = new_score,
    confidence = LEAST(1, GREATEST(0, confidence + CASE WHEN p_correct THEN 0.08 ELSE -0.04 END)),
    exposure_count = exposure_count + 1,
    correct_count = correct_count + CASE WHEN p_correct THEN 1 ELSE 0 END,
    incorrect_count = incorrect_count + CASE WHEN p_correct THEN 0 ELSE 1 END,
    consecutive_correct = CASE WHEN p_correct THEN consecutive_correct + 1 ELSE 0 END,
    consecutive_incorrect = CASE WHEN p_correct THEN 0 ELSE consecutive_incorrect + 1 END,
    difficulty_level = COALESCE(NULLIF(p_difficulty, ''), difficulty_level),
    learning_stage = CASE
      WHEN new_score >= 0.85 THEN 'mastered'
      WHEN new_score >= 0.70 THEN 'proficient'
      WHEN new_score >= 0.45 THEN 'developing'
      WHEN exposure_count > 0 THEN 'familiar'
      ELSE 'introduced'
    END,
    misconception = COALESCE(NULLIF(p_misconception, ''), misconception),
    last_assessed_at = NOW(),
    last_practiced_at = NOW(),
    updated_at = NOW()
  WHERE id = r.id
  RETURNING * INTO r;

  RETURN r;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- Akili enhancements: adaptive context, upload quotas, facts and optional provider settings.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS region TEXT DEFAULT 'Nigeria';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS persona TEXT DEFAULT 'friendly';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_agent_prompt TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_model TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS region_context JSONB DEFAULT '{}'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'English';

CREATE TABLE IF NOT EXISTS ai_facts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  topic TEXT NOT NULL,
  fact_type TEXT NOT NULL DEFAULT 'scientific',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ai_facts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_facts_own" ON ai_facts;
CREATE POLICY "ai_facts_own" ON ai_facts FOR ALL USING (auth.uid() = user_id);

-- Optional: tune per-user upload quota without changing application code.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS max_documents INTEGER DEFAULT 20;

-- Notes used by the Materials workspace.
CREATE TABLE IF NOT EXISTS notes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notes_project_idx ON notes(user_id, project_id, created_at DESC);
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notes_own" ON notes;
CREATE POLICY "notes_own" ON notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
