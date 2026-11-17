-- row-level security on credit_transactions
--
-- A principal can see their own household's ledger and nothing else. Admins
-- can see and add to every ledger, which the sign-in PWA depends on: it signs
-- in as a real admin and writes with the anon key, so it has no service-role
-- key to lean on.
--
-- There are deliberately no UPDATE or DELETE policies. The append-only trigger
-- on the table refuses those outright, even for the service role.

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Principals can read their own household's transactions"
  ON public.credit_transactions
  FOR SELECT
  TO authenticated
  USING (
    principal_id IN (
      SELECT id FROM public.principals WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and superusers can read all transactions"
  ON public.credit_transactions
  FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'superuser'));

CREATE POLICY "Admins and superusers can insert transactions"
  ON public.credit_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'superuser'));
