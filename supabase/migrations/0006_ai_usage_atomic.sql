-- Atomic daily AI quota.
-- The old route read the counter, then wrote read+1, so concurrent requests could
-- undercount. This does the check and the increment in one statement.
-- Returns the new count, or -1 when the limit for that day is already reached.
-- Called only by the server with the service role key.

CREATE OR REPLACE FUNCTION public.increment_ai_usage(p_user UUID, p_date DATE, p_limit INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  INSERT INTO ai_usage (user_id, usage_date, count)
  VALUES (p_user, p_date, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET count = ai_usage.count + 1
  WHERE ai_usage.count < p_limit
  RETURNING count INTO new_count;

  RETURN COALESCE(new_count, -1);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_ai_usage(UUID, DATE, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage(UUID, DATE, INTEGER) TO service_role;
