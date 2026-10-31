-- 0012: plans, subscriptions and an admin audit log
--
-- plans          one row per plan ('free', 'pro'). Prices, limits and features are DATA, edited by an admin in the app
--                (/admin/plans), so a price change needs no deploy. Prices are in kobo (1 naira = 100 kobo), like PastQ.
-- subscriptions  who is on which plan, and until when. Written only by the server (admin grant now, payment webhook later).
-- plan_audit     who changed what, and when.
--
-- Safe to run more than once. Run after 0001-0011.

CREATE TABLE IF NOT EXISTS plans (
  id          TEXT PRIMARY KEY CHECK (id IN ('free', 'pro')),
  name        TEXT NOT NULL,
  price_kobo  INTEGER CHECK (price_kobo IS NULL OR price_kobo >= 0),   -- NULL = price not set yet
  currency    TEXT NOT NULL DEFAULT 'NGN',
  "interval"  TEXT NOT NULL DEFAULT 'month' CHECK ("interval" IN ('month')),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  features    TEXT[] NOT NULL DEFAULT '{}',
  limits      JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id             UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id             TEXT NOT NULL REFERENCES plans(id),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  current_period_end  TIMESTAMPTZ,                 -- NULL = no end date
  source              TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'paystack', 'trial')),
  updated_by          UUID,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_audit (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  actor_id    UUID,
  action      TEXT NOT NULL,
  target      TEXT NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_audit ENABLE ROW LEVEL SECURITY;

-- Anyone may read the active plans (prices can be shown before sign-in). Nobody but the server may change them.
DROP POLICY IF EXISTS "plans_read" ON plans;
CREATE POLICY "plans_read" ON plans FOR SELECT USING (active = TRUE);
-- A learner may read only their own subscription. No insert/update/delete policy: writes go through the server (service role).
DROP POLICY IF EXISTS "subscriptions_own_read" ON subscriptions;
CREATE POLICY "subscriptions_own_read" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
-- plan_audit has no policies: only the service role can read or write it.

INSERT INTO plans (id, name, price_kobo, features, limits) VALUES
  ('free', 'Free', 0, '{}',
    '{"daily_ai":20,"course_material_chars":30000,"max_projects":5,"daily_image_generations":0,"daily_visual_plans":10}'),
  ('pro', 'Pro', NULL,
    '{hourly_reminders,cloud_tts,image_generation,video_export,search_grounding,long_materials,deep_courses}',
    '{"daily_ai":200,"course_material_chars":150000,"max_projects":null,"daily_image_generations":20,"daily_visual_plans":100}')
ON CONFLICT (id) DO NOTHING;
