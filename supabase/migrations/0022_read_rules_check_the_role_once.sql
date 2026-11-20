-- every read rule works out who you are once per query, not once per row
--
-- All thirteen read policies that depend on who's asking called the role or
-- identity function directly, `public.can_run_a_session()` or
-- `auth.uid()` and the like. Postgres re-runs a bare call for every row the
-- policy checks, and since 0021 pinned their search_path these functions
-- can't be inlined either. So each row cost can_run_a_session() ->
-- current_app_role() -> auth.jwt(), which parses the request's JWT claims
-- again.
--
-- That adds up on the ledger. The registrar app reads principal_balances,
-- which sums the whole ledger, when it opens and on every 20-second refresh
-- on every phone. Free with 28 rows; about 24,000 calls per read after three
-- seasons.
--
-- Wrapping a call as `(select …)` makes it an InitPlan: Postgres works the
-- value out once for the query and compares each row with that. Supabase
-- recommends this form for RLS. Who can read what doesn't change, only how
-- often it's worked out. It also cancels 0021's inlining cost.
--
-- ALTER POLICY changes only the expression. Each policy keeps its name, its
-- command and its roles. The `own_household_member_ids()` policies are left as
-- they are: they call it inside an uncorrelated `IN (SELECT …)`, which
-- Postgres already evaluates once.

ALTER POLICY "Registrars and admins can read all attendance" ON public.attendance
  USING ((select public.can_run_a_session()));

ALTER POLICY "Registrars and admins can read attendance aliases" ON public.attendance_aliases
  USING ((select public.can_run_a_session()));

ALTER POLICY "Principals can read their own household's transactions" ON public.credit_transactions
  USING (principal_id IN (SELECT id FROM public.principals WHERE auth_user_id = (select auth.uid())));

ALTER POLICY "Registrars and admins can read all transactions" ON public.credit_transactions
  USING ((select public.can_run_a_session()));

ALTER POLICY "Registrars and admins can read guests" ON public.guests
  USING ((select public.can_run_a_session()));

ALTER POLICY "Registrars and admins can read all group membership" ON public.member_groups
  USING ((select public.can_run_a_session()));

ALTER POLICY "Admins and superusers can read all members" ON public.members
  USING ((select auth.jwt() ->> 'app_role') IN ('admin', 'superuser'));

ALTER POLICY "Principals can read their own household's members" ON public.members
  USING (principal_id IN (SELECT id FROM public.principals WHERE auth_user_id = (select auth.uid())));

ALTER POLICY "Registrars can read all members" ON public.members
  USING ((select public.current_app_role()) = 'registrar');

ALTER POLICY "Admins and superusers can read all principals" ON public.principals
  USING ((select auth.jwt() ->> 'app_role') IN ('admin', 'superuser'));

ALTER POLICY "Principals can read their own row" ON public.principals
  USING (auth_user_id = (select auth.uid()));

ALTER POLICY "Registrars can read all principals" ON public.principals
  USING ((select public.current_app_role()) = 'registrar');

ALTER POLICY "Registrars and admins can read all sessions" ON public.training_sessions
  USING ((select public.can_run_a_session()));
