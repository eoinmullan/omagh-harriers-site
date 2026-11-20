-- a login reads the columns it uses, and no more
--
-- A registrar is a volunteer, often on a borrowed phone. The registrar app
-- asks `members` for id, first name, surname and household, and asks
-- `principals` for the household's name. It never needs a date of birth, a
-- gender, an Athletics NI number or anybody's email. But `0010`'s policies,
-- "Registrars can read all members" and "Registrars can read all principals",
-- grant whole rows. So any registrar's token could fetch every child's date of
-- birth and every family's email with one REST call. The app's queries were
-- minimal. What the token would hand out was not.
--
-- RLS decides rows, never columns, so this is done with column privileges. The
-- row rules stay exactly as they are. Every login gets a column ceiling on top.
--
-- A view was the other option, and it fails both ways. A `security_invoker`
-- view still runs under the base tables' RLS, so the registrar keeps full-row
-- access to the tables underneath. A definer view bypasses RLS, so it has to
-- re-implement the role check itself, and that is the copy of the rule that
-- goes stale (the reason `0011` gives for keeping its functions
-- SECURITY INVOKER). Removing the registrar's row access would also empty
-- `principal_balances`, which is security_invoker and joins `principals`. That
-- would leave every balance beside every name blank.
--
-- The columns below are every column read without the service role, checked
-- against every call site: the middleware, the sign-in callback, the terms
-- page, the members' area, the registrar app, and the RLS helper
-- `own_household_member_ids()`. Only one page needed a hidden column.
-- `members/index.astro` shows a member their own children's dates of birth, so
-- it now reads that through the service role, scoped to its own principal. That
-- is how `/members/credits` already reads the ledger.
--
-- What stays visible across the club, because column privileges can't tell one
-- row from another: a principal's role, active flag and terms date, and the
-- auth user id. None of it is contact or identity data about a child.
--
-- `anon` loses table-level SELECT too and gets nothing back. It had no rows
-- through RLS anyway, and nothing unauthenticated reads these tables. The
-- service role is untouched; it keeps every column.
--
-- A future `GRANT SELECT ON ALL TABLES ... TO authenticated` would silently
-- restore the whole rows. Don't write one.

REVOKE SELECT ON public.principals FROM anon, authenticated;
GRANT SELECT (id, auth_user_id, display_name, role, is_active, terms_accepted_at)
  ON public.principals TO authenticated;

REVOKE SELECT ON public.members FROM anon, authenticated;
GRANT SELECT (id, principal_id, first_name, surname, is_active)
  ON public.members TO authenticated;
