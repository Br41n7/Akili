-- Courses now read every uploaded file by topic (and can be extended from the parts not yet used), so the old
-- "pages read" limit becomes a generous safety bound instead of a cut-off after ~17 pages.
-- Only rows still at the old defaults are changed; limits an admin edited are left alone.
UPDATE plans SET limits = jsonb_set(limits, '{course_material_chars}', '400000') WHERE id = 'free' AND (limits->>'course_material_chars')::int = 30000;
UPDATE plans SET limits = jsonb_set(limits, '{course_material_chars}', '1000000') WHERE id = 'pro'  AND (limits->>'course_material_chars')::int = 150000;
