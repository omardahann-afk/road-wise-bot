
-- 1. usage_limits: prevent users from resetting their own counters
DROP POLICY IF EXISTS "usage owner write" ON public.usage_limits;
-- Keep SELECT for owner ("usage owner read" remains). No INSERT/UPDATE/DELETE
-- for end users — writes happen via service role only (edge functions).

-- 2. profiles: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "Profiles viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated users"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. recall_cache: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "recall_cache readable by all" ON public.recall_cache;
CREATE POLICY "recall_cache readable by authenticated"
  ON public.recall_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- 4. Lock down SECURITY DEFINER functions
-- has_role: needed inside RLS policies; revoke from anon, keep for authenticated
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- handle_new_user: trigger only, no direct callers
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

-- update_updated_at_column: trigger only, no direct callers
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM anon;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM authenticated;
