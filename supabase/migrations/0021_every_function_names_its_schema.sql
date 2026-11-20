-- every function fixes its search path
--
-- Seven functions from the early migrations resolve unqualified names
-- through whatever search_path the caller has. All of them already
-- schema-qualify what they touch, and pg_catalog is always searched first, so
-- the practical risk was small. But it was a risk the code took on trust, and
-- Supabase's linter flags it (function_search_path_mutable). Every function
-- written since `0011` pins the path; these are the ones from before that.
--
-- `custom_access_token_hook` matters most. It runs as supabase_auth_admin on
-- every token Supabase issues, and every RLS rule in the project depends on
-- the claim it writes.
--
-- One trade-off. Postgres will not inline a SQL function that has a SET
-- clause. `current_app_role`, `is_club_admin` and `can_run_a_session` are
-- called on every row an RLS policy checks, so each now costs a function call
-- per row where it was folded into the query before. At this club's size
-- that's noise. Round 3's performance pass is expected to wrap those calls as
-- `(select public.can_run_a_session())`, which evaluates them once per query
-- and makes inlining irrelevant.
--
-- Bodies are unchanged. ALTER FUNCTION adds the setting without redefining
-- anything.

ALTER FUNCTION public.current_app_role()                   SET search_path = public, pg_temp;
ALTER FUNCTION public.is_club_admin()                      SET search_path = public, pg_temp;
ALTER FUNCTION public.can_run_a_session()                  SET search_path = public, pg_temp;
ALTER FUNCTION public.own_household_member_ids()           SET search_path = public, pg_temp;
ALTER FUNCTION public.custom_access_token_hook(jsonb)      SET search_path = public, pg_temp;
ALTER FUNCTION public.forbid_credit_transaction_rewrite()  SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at()                     SET search_path = public, pg_temp;
