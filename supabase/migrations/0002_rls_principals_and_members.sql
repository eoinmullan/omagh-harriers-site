-- row-level security on principals and members
--
-- Service-role key bypasses RLS entirely, so the Klubfunder sync script and
-- admin-add endpoints operate freely. Authenticated users only see their own
-- household.
--
-- Note on role escalation: PostgreSQL RLS is row-level, not column-level, so
-- we can't use a policy to forbid an admin from changing the `role` column
-- while permitting them to change other columns. Role changes route through a
-- SECURITY DEFINER RPC that performs the superuser check before updating the
-- role column directly. RLS here only enforces row-level access.

ALTER TABLE public.principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members    ENABLE ROW LEVEL SECURITY;

-- principals --------------------------------------------------------------

CREATE POLICY "Principals can read their own row"
  ON public.principals
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "Admins and superusers can read all principals"
  ON public.principals
  FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'superuser'));

CREATE POLICY "Admins and superusers can insert principals"
  ON public.principals
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'superuser'));

CREATE POLICY "Admins and superusers can update principals"
  ON public.principals
  FOR UPDATE
  TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'superuser'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'superuser'));

-- members -----------------------------------------------------------------

CREATE POLICY "Principals can read their own household's members"
  ON public.members
  FOR SELECT
  TO authenticated
  USING (
    principal_id IN (
      SELECT id FROM public.principals WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and superusers can read all members"
  ON public.members
  FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'superuser'));

CREATE POLICY "Admins and superusers can insert members"
  ON public.members
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'superuser'));

CREATE POLICY "Admins and superusers can update members"
  ON public.members
  FOR UPDATE
  TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'superuser'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'superuser'));
