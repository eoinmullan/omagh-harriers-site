-- close the admin-to-superuser self-promotion
--
-- The boundary between `admin` and `superuser` is that only a superuser hands
-- out roles. That rule lived in one place — `planRoleChange` in auth/roles.ts,
-- on a page that writes with the service-role key — and the database did not
-- back it up.
--
-- The `authenticated` UPDATE policy on `principals` (0002, re-expressed in 0004)
-- checks only the actor's own claim:
--
--   USING / WITH CHECK (auth.jwt() ->> 'app_role' IN ('admin', 'superuser'))
--
-- Nothing about the row, nothing about the columns. RLS is row-level, not
-- column-level, so an admin may update any principals row including its `role`
-- column, including their own. An admin holds a real anon-key session — it is
-- what the members' area runs on — and from it a single PATCH of their own row
-- to role=superuser satisfies the policy and lands. The UI's superuser-only
-- gate is never consulted, because the UI is not in the path.
--
-- 0002 foresaw exactly this and said the mitigation would be a SECURITY DEFINER
-- RPC doing the superuser check. That RPC was never built; role changes went
-- through TypeScript on a service-role page instead. So the schema documented a
-- defence that did not exist.
--
-- The fix is a removal. Every first-party write to principals and members goes
-- through the service-role client, which bypasses RLS — all 19 write call sites
-- were checked, including the Klubfunder sync core, which is handed a
-- service-role client by its CLI. The only anon-key access these tables need is
-- SELECT: the registrar island, the middleware and the members' area all read,
-- none writes. So these four policies are relied on by nothing, and while they
-- exist they are the escalation vector. Drop them.
--
-- The SELECT policies are untouched: a member still reads their own household, a
-- registrar and an admin still read the whole club. Only the unused INSERT and
-- UPDATE grants to the anon key go.
--
-- If a future phase ever needs an admin to write these tables on the anon key,
-- the `role` column specifically wants the SECURITY DEFINER RPC 0002 described,
-- or a BEFORE UPDATE trigger refusing a role change by a non-superuser — not a
-- blanket policy that cannot see the column it needs to protect.

DROP POLICY IF EXISTS "Admins and superusers can insert principals" ON public.principals;
DROP POLICY IF EXISTS "Admins and superusers can update principals" ON public.principals;
DROP POLICY IF EXISTS "Admins and superusers can insert members"    ON public.members;
DROP POLICY IF EXISTS "Admins and superusers can update members"    ON public.members;
