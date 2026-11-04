-- Large uploads: files over ~4 MB go from the browser straight to a temporary private bucket (Vercel limits request
-- bodies to 4.5 MB), are read by the server, then deleted. Nothing is kept in this bucket.
-- Also adds a plan limit 'max_file_mb' (Free 10, Pro 25), editable in /admin/plans.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('uploads-temp', 'uploads-temp', FALSE, 52428800)
ON CONFLICT (id) DO NOTHING;

UPDATE plans SET limits = limits || '{"max_file_mb": 10}'::jsonb WHERE id = 'free' AND NOT (limits ? 'max_file_mb');
UPDATE plans SET limits = limits || '{"max_file_mb": 25}'::jsonb WHERE id = 'pro'  AND NOT (limits ? 'max_file_mb');
