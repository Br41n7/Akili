-- AKILI SECURITY HARDENING
-- Safe to run after the original schema + adaptive migrations.
-- Fixes Supabase linter warnings without breaking the app's intended behavior.

-- 1) Public thumbnail buckets do not need a SELECT policy.
-- Public object URLs are served by Storage itself; a broad SELECT policy
-- unnecessarily permits object listing through the storage API.
DROP POLICY IF EXISTS "thumbnails_public_read" ON storage.objects;
DROP POLICY IF EXISTS "thumbnails_public_object_read" ON storage.objects;

-- 2) Harden SECURITY DEFINER functions and remove direct RPC access from
-- anonymous/signed-in roles unless the function is explicitly an application RPC.
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid,
           n.nspname AS schema_name,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.prosecdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'handle_new_user',
        'update_bank_rating',
        'handle_successful_purchase',
        'rls_auto_enable',
        'update_adaptive_concept'
      )
  LOOP
    -- SECURITY DEFINER functions use a fixed search path so a caller cannot
    -- redirect unqualified object names through a hostile schema/temp object.
    IF f.prosecdef THEN
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
        f.schema_name, f.proname, f.args
      );
    END IF;

    -- Revoke inherited/default RPC execution.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC', f.schema_name, f.proname, f.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon', f.schema_name, f.proname, f.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated', f.schema_name, f.proname, f.args);
  END LOOP;

  -- update_adaptive_concept is the only one intentionally called by the app.
  -- Grant authenticated users access to every overload so this migration also
  -- handles databases where an earlier version used a slightly different signature.
  FOR f IN
    SELECT p.oid,
           n.nspname AS schema_name,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'update_adaptive_concept'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated', f.schema_name, f.proname, f.args);
  END LOOP;
END $$;

-- 3) Defense in depth: replace the canonical adaptive RPC with a version that
-- also verifies project ownership. Any older overloads remain revoked above.
CREATE OR REPLACE FUNCTION public.update_adaptive_concept(
  p_user_id UUID,
  p_project_id UUID,
  p_concept TEXT,
  p_correct BOOLEAN,
  p_misconception TEXT DEFAULT NULL,
  p_difficulty TEXT DEFAULT 'foundational'
) RETURNS public.learner_concepts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $body$
DECLARE
  r public.learner_concepts;
  old_score NUMERIC;
  new_score NUMERIC;
  project_owner UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT user_id INTO project_owner
  FROM public.projects
  WHERE id = p_project_id;

  IF project_owner IS NULL OR project_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Project not owned by current user';
  END IF;

  SELECT * INTO r
  FROM public.learner_concepts
  WHERE user_id = p_user_id
    AND project_id = p_project_id
    AND lower(concept) = lower(trim(p_concept))
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.learner_concepts (
      user_id, project_id, concept, mastery_score, confidence,
      exposure_count, correct_count, incorrect_count,
      consecutive_correct, consecutive_incorrect,
      difficulty_level, learning_stage, misconception,
      last_assessed_at, last_practiced_at
    ) VALUES (
      p_user_id, p_project_id, trim(p_concept),
      CASE WHEN p_correct THEN 0.55 ELSE 0.15 END,
      0.25, 1,
      CASE WHEN p_correct THEN 1 ELSE 0 END,
      CASE WHEN p_correct THEN 0 ELSE 1 END,
      CASE WHEN p_correct THEN 1 ELSE 0 END,
      CASE WHEN p_correct THEN 0 ELSE 1 END,
      COALESCE(NULLIF(p_difficulty, ''), 'foundational'),
      CASE WHEN p_correct THEN 'familiar' ELSE 'introduced' END,
      p_misconception, NOW(), NOW()
    ) RETURNING * INTO r;
    RETURN r;
  END IF;

  old_score := r.mastery_score;
  IF p_correct THEN
    new_score := LEAST(1, old_score + (0.10 + LEAST(r.consecutive_correct, 3) * 0.025));
  ELSE
    new_score := GREATEST(0, old_score - 0.14);
  END IF;

  UPDATE public.learner_concepts SET
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
$body$;

GRANT EXECUTE ON FUNCTION public.update_adaptive_concept(uuid, uuid, text, boolean, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_adaptive_concept(uuid, uuid, text, boolean, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_adaptive_concept(uuid, uuid, text, boolean, text, text) FROM PUBLIC;
