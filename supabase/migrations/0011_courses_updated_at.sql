-- 0011: courses (and course_progress) updated_at
--
-- Symptom: saving a course module fails with
--   42703 record "new" has no field "updated_at"
-- That means the database has an "update updated_at" trigger on `courses` (it is not created by migrations 0001-0010,
-- so it was added by hand or by a dashboard tool) but the table has no such column. Adding the column makes the
-- existing trigger work. Safe to run more than once; changes no existing data.

ALTER TABLE courses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE course_progress ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- To see which triggers exist on these tables (optional):
--   SELECT event_object_table AS tbl, trigger_name, action_statement
--   FROM information_schema.triggers
--   WHERE event_object_table IN ('courses', 'course_progress');
