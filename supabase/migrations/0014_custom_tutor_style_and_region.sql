-- 0014: custom tutor style (Pro) and a global default region
--
-- custom_tutor_style  the learner's own description of how the tutor should teach (max 300 characters).
--                     Used only while their plan includes the 'custom_tutor_style' feature (checked on the server).
-- plans               adds the feature to the Pro plan (an admin can remove it in /admin/plans).
-- region              new accounts default to 'Other' (neutral examples) until the learner chooses a country.
-- Safe to run more than once. Run after 0013.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_tutor_style TEXT CHECK (custom_tutor_style IS NULL OR char_length(custom_tutor_style) <= 300);

UPDATE plans SET features = array_append(features, 'custom_tutor_style')
WHERE id = 'pro' AND NOT ('custom_tutor_style' = ANY(features));

ALTER TABLE profiles ALTER COLUMN region SET DEFAULT 'Other';
