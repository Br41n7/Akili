-- ════════════════════════════════════════════════════════════════
-- AKILI: PROJECT CONTEXT (University vs Secondary / O-Level)
-- Run once in the Supabase SQL Editor, after the existing schema and migrations.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS education_level TEXT,
  ADD COLUMN IF NOT EXISTS exam_board      TEXT,
  ADD COLUMN IF NOT EXISTS class_level     TEXT,
  ADD COLUMN IF NOT EXISTS institution     TEXT,
  ADD COLUMN IF NOT EXISTS department      TEXT,
  ADD COLUMN IF NOT EXISTS course_code     TEXT,
  ADD COLUMN IF NOT EXISTS study_year      TEXT,
  ADD COLUMN IF NOT EXISTS study_goal      TEXT;

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_education_level_check;
ALTER TABLE projects ADD CONSTRAINT projects_education_level_check
  CHECK (education_level IS NULL OR education_level IN ('university', 'secondary'));

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_study_goal_check;
ALTER TABLE projects ADD CONSTRAINT projects_study_goal_check
  CHECK (study_goal IS NULL OR study_goal IN ('exam_prep', 'coursework', 'self_study'));

-- Backfill existing rows from the old free-text exam_type.
-- Secondary exams
UPDATE projects
SET education_level = 'secondary',
    exam_board = CASE UPPER(exam_type)
      WHEN 'WAEC'      THEN 'WAEC'
      WHEN 'WASSCE'    THEN 'WAEC'
      WHEN 'NECO'      THEN 'NECO'
      WHEN 'JAMB'      THEN 'JAMB'
      WHEN 'UTME'      THEN 'JAMB'
      WHEN 'POST-UTME' THEN 'JAMB'
      WHEN 'KCSE'      THEN 'KCSE'
      WHEN 'GCE'       THEN 'GCE'
      WHEN 'IGCSE'     THEN 'IGCSE'
      ELSE 'SCHOOL'
    END
WHERE education_level IS NULL
  AND UPPER(COALESCE(exam_type, '')) IN ('WAEC','WASSCE','NECO','JAMB','UTME','POST-UTME','KCSE','BECE','GCE','IGCSE');

-- University / self-study / professional
UPDATE projects
SET education_level = 'university'
WHERE education_level IS NULL
  AND (exam_type IS NULL OR exam_type IN ('University / Self-study', 'Professional / Certification', 'UNIVERSITY'));

-- Anything else (for example an old "OTHER") stays NULL; the app treats it as university.

CREATE INDEX IF NOT EXISTS projects_user_level_idx ON projects(user_id, education_level);
