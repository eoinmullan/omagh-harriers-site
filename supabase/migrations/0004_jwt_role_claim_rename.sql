-- Rename the JWT role claim from `role` to `app_role`.
--
-- The `role` claim in a Supabase JWT is reserved: PostgREST reads it to set
-- the PostgreSQL session role (e.g. `authenticated`, `anon`). Putting an
-- application value like "admin" there causes PostgREST to attempt
-- `SET ROLE admin`, which fails because no such PostgreSQL role exists.
--
-- Fix: store the application role under `app_role` and update all RLS
-- policies that reference auth.jwt() ->> 'role' to use `app_role` instead.

-- 1. Fix the hook ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  principal_role text;
BEGIN
  SELECT role INTO principal_role
  FROM public.principals
  WHERE auth_user_id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';

  IF principal_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_role}', to_jsonb(principal_role));
  ELSE
    claims := jsonb_set(claims, '{app_role}', '"none"'::jsonb);
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- 2. Update RLS policies on principals ------------------------------------------

DROP POLICY IF EXISTS "Admins and superusers can read all principals"  ON public.principals;
DROP POLICY IF EXISTS "Admins and superusers can insert principals"     ON public.principals;
DROP POLICY IF EXISTS "Admins and superusers can update principals"     ON public.principals;

CREATE POLICY "Admins and superusers can read all principals"
  ON public.principals
  FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'app_role' IN ('admin', 'superuser'));

CREATE POLICY "Admins and superusers can insert principals"
  ON public.principals
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.jwt() ->> 'app_role' IN ('admin', 'superuser'));

CREATE POLICY "Admins and superusers can update principals"
  ON public.principals
  FOR UPDATE
  TO authenticated
  USING (auth.jwt() ->> 'app_role' IN ('admin', 'superuser'))
  WITH CHECK (auth.jwt() ->> 'app_role' IN ('admin', 'superuser'));

-- 3. Update RLS policies on members ---------------------------------------------

DROP POLICY IF EXISTS "Admins and superusers can read all members"   ON public.members;
DROP POLICY IF EXISTS "Admins and superusers can insert members"     ON public.members;
DROP POLICY IF EXISTS "Admins and superusers can update members"     ON public.members;

CREATE POLICY "Admins and superusers can read all members"
  ON public.members
  FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'app_role' IN ('admin', 'superuser'));

CREATE POLICY "Admins and superusers can insert members"
  ON public.members
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.jwt() ->> 'app_role' IN ('admin', 'superuser'));

CREATE POLICY "Admins and superusers can update members"
  ON public.members
  FOR UPDATE
  TO authenticated
  USING (auth.jwt() ->> 'app_role' IN ('admin', 'superuser'))
  WITH CHECK (auth.jwt() ->> 'app_role' IN ('admin', 'superuser'));
