-- row-level security for sessions, attendance, and the registrar role
--
-- The sign-in PWA has no service-role key. It signs in as a real person and
-- writes with the anon key, so every single thing it needs to do has to be
-- expressible here. That is the reason this file is as long as it is.
--
-- It also repairs 0008, which gated credit_transactions on
-- `auth.jwt() ->> 'role'`. 0004 had already moved the application role to the
-- `app_role` claim, because PostgREST reserves `role` for the PostgreSQL
-- session role. Those three policies have therefore never matched anybody —
-- a signed-in user's `role` claim is `authenticated`. Phase 4 did not notice
-- because its admin pages read the ledger with the service-role key, which
-- bypasses RLS. Phase 5 would have noticed immediately.

-- who is who --------------------------------------------------------------
--
-- One definition each, rather than the same claim lookup spelled out in
-- twenty policies and misspelled in one of them.

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT auth.jwt() ->> 'app_role';
$$;

CREATE OR REPLACE FUNCTION public.is_club_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.current_app_role() IN ('admin', 'superuser');
$$;

CREATE OR REPLACE FUNCTION public.can_run_a_session()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.current_app_role() IN ('registrar', 'admin', 'superuser');
$$;

-- Attendance the signed-in principal is entitled to see: their own
-- household's, and nobody else's.
CREATE OR REPLACE FUNCTION public.own_household_member_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
AS $$
  SELECT m.id
  FROM public.members m
  JOIN public.principals p ON p.id = m.principal_id
  WHERE p.auth_user_id = auth.uid();
$$;

ALTER TABLE public.groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_groups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance        ENABLE ROW LEVEL SECURITY;

-- groups ------------------------------------------------------------------
--
-- Readable by anyone signed in. A squad name is not sensitive, and a member
-- looking at their own training history needs it to make sense of a session.

CREATE POLICY "Signed-in users can read groups"
  ON public.groups
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and superusers can insert groups"
  ON public.groups
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_club_admin());

CREATE POLICY "Admins and superusers can update groups"
  ON public.groups
  FOR UPDATE
  TO authenticated
  USING (public.is_club_admin())
  WITH CHECK (public.is_club_admin());

-- training_sessions -------------------------------------------------------
--
-- Registrars may create a session as well as read one. Creating sessions is
-- the admin site's job, but a registrar blocked at the track by a row nobody
-- got round to adding is exactly the failure this phase exists to avoid.
--
-- Editing one stays with admins: price and cancellation have to agree with a
-- ledger the registrar cannot see the whole of.

CREATE POLICY "Registrars and admins can read all sessions"
  ON public.training_sessions
  FOR SELECT
  TO authenticated
  USING (public.can_run_a_session());

CREATE POLICY "Principals can read sessions their household attended"
  ON public.training_sessions
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT a.session_id
      FROM public.attendance a
      WHERE a.member_id IN (SELECT public.own_household_member_ids())
    )
  );

CREATE POLICY "Registrars and admins can insert sessions"
  ON public.training_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_run_a_session());

CREATE POLICY "Admins and superusers can update sessions"
  ON public.training_sessions
  FOR UPDATE
  TO authenticated
  USING (public.is_club_admin())
  WITH CHECK (public.is_club_admin());

-- member_groups -----------------------------------------------------------
--
-- The registrar app reads this to build the Usuals list. Assigning members to
-- squads is an admin job done sitting down, not at the track.

CREATE POLICY "Registrars and admins can read all group membership"
  ON public.member_groups
  FOR SELECT
  TO authenticated
  USING (public.can_run_a_session());

CREATE POLICY "Principals can read their own household's group membership"
  ON public.member_groups
  FOR SELECT
  TO authenticated
  USING (member_id IN (SELECT public.own_household_member_ids()));

CREATE POLICY "Admins and superusers can insert group membership"
  ON public.member_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_club_admin());

CREATE POLICY "Admins and superusers can delete group membership"
  ON public.member_groups
  FOR DELETE
  TO authenticated
  USING (public.is_club_admin());

-- guests ------------------------------------------------------------------
--
-- Guests have no login, so there is no read path of their own to grant.
-- Correcting a spelling is an admin job; a registrar adds and reads.

CREATE POLICY "Registrars and admins can read guests"
  ON public.guests
  FOR SELECT
  TO authenticated
  USING (public.can_run_a_session());

CREATE POLICY "Registrars and admins can insert guests"
  ON public.guests
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_run_a_session());

CREATE POLICY "Admins and superusers can update guests"
  ON public.guests
  FOR UPDATE
  TO authenticated
  USING (public.is_club_admin())
  WITH CHECK (public.is_club_admin());

-- attendance --------------------------------------------------------------
--
-- Insert and delete, but deliberately no update. Unticking somebody removes
-- the row rather than amending it, and a guest's payment figure states what
-- they handed over and is not editable — a wrong tick is cleared by unticking,
-- which takes the attendance row and the cash with it.

CREATE POLICY "Registrars and admins can read all attendance"
  ON public.attendance
  FOR SELECT
  TO authenticated
  USING (public.can_run_a_session());

CREATE POLICY "Principals can read their own household's attendance"
  ON public.attendance
  FOR SELECT
  TO authenticated
  USING (member_id IN (SELECT public.own_household_member_ids()));

CREATE POLICY "Registrars and admins can insert attendance"
  ON public.attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_run_a_session());

CREATE POLICY "Registrars and admins can delete attendance"
  ON public.attendance
  FOR DELETE
  TO authenticated
  USING (public.can_run_a_session());

-- principals and members, as the registrar app needs them ------------------
--
-- The app cannot show a list of names, or a household balance beside one,
-- without reading both tables across the whole club. Read only: a registrar
-- can see who is in the club, and change nothing about them.

CREATE POLICY "Registrars can read all principals"
  ON public.principals
  FOR SELECT
  TO authenticated
  USING (public.current_app_role() = 'registrar');

CREATE POLICY "Registrars can read all members"
  ON public.members
  FOR SELECT
  TO authenticated
  USING (public.current_app_role() = 'registrar');

-- credit_transactions ------------------------------------------------------
--
-- Replaces the three policies 0008 pinned to the wrong claim. Registrars join
-- admins here: the household balance shown beside every name is the sum of
-- this ledger, read through the principal_balances view, which is
-- security_invoker and so obeys whatever the reader is allowed to see.
--
-- Still no UPDATE or DELETE policy for anyone. The append-only trigger
-- refuses both outright, service-role key included.

DROP POLICY IF EXISTS "Admins and superusers can read all transactions" ON public.credit_transactions;
DROP POLICY IF EXISTS "Admins and superusers can insert transactions"   ON public.credit_transactions;

CREATE POLICY "Registrars and admins can read all transactions"
  ON public.credit_transactions
  FOR SELECT
  TO authenticated
  USING (public.can_run_a_session());

CREATE POLICY "Registrars and admins can insert transactions"
  ON public.credit_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_run_a_session());
