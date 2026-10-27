-- Push reminders: where to send (push_subscriptions) and when (profile columns).
-- Sending is done by the server with the service role; clients can only read and remove their own rows.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reminder_hour SMALLINT NOT NULL DEFAULT 18 CHECK (reminder_hour BETWEEN 0 AND 23);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reminder_tz TEXT NOT NULL DEFAULT 'Africa/Lagos';
-- The local calendar day of the last reminder, so one is sent per day at most.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_reminder_on DATE;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_success_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS profiles_reminders_idx ON profiles (reminder_hour) WHERE reminders_enabled;

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions_select_own" ON push_subscriptions;
CREATE POLICY "push_subscriptions_select_own" ON push_subscriptions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subscriptions_delete_own" ON push_subscriptions;
CREATE POLICY "push_subscriptions_delete_own" ON push_subscriptions FOR DELETE USING (auth.uid() = user_id);
-- No insert or update policy on purpose: subscriptions are stored by /api/push/subscribe after validation.
