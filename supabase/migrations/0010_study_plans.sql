-- Study planner: one plan per learner per project. The plan itself is JSON built by lib/study-plan.ts.
CREATE TABLE IF NOT EXISTS study_plans (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  exam_date DATE NOT NULL,
  minutes_per_day SMALLINT NOT NULL CHECK (minutes_per_day BETWEEN 15 AND 480),
  days_off SMALLINT[] NOT NULL DEFAULT '{}',
  plan JSONB NOT NULL,
  done_task_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

ALTER TABLE study_plans ENABLE ROW LEVEL SECURITY;

-- Owner only, and the project must also be the owner's.
CREATE POLICY "plans_own" ON study_plans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
