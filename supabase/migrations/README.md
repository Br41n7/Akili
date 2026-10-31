# Supabase migrations

Apply in numeric order in the Supabase SQL editor (or `supabase db push`).
Back up the database first. Files `0002` onward are written to be re-runnable.

| File | Purpose |
| --- | --- |
| 0001_schema.sql | Base schema (formerly `supabase-schema.sql`) |
| 0002_adaptive.sql | Learner concepts, evidence, facts, notes |
| 0003_notes.sql | Note titles and updated_at |
| 0004_project_context.sql | Education level and exam context on projects |
| 0005_security_hardening.sql | Storage policy and function privilege fixes |
| 0006_ai_usage_atomic.sql | Atomic daily AI quota function |
| 0007_study_artifacts.sql | Study guides and slide decks (generic table with RLS) |
| 0008_infographic_kind.sql | Adds the infographic kind (run after 0007) |
| 0009_push_reminders.sql | Push subscriptions and reminder settings |
| 0010_study_plans.sql | Study planner (one plan per learner per project) |
| 0011_courses_updated_at.sql | Adds `updated_at` to `courses` and `course_progress`. Run it if saving a course module fails with `record "new" has no field "updated_at"` |
| 0012_plans.sql | Plans, subscriptions and the admin audit log (prices and limits editable in /admin/plans) |

`o.sql` was removed: every statement in it already exists in `0002_adaptive.sql`.
