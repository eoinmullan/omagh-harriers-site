-- custom access token hook
--
-- Injects the principal's role into every issued JWT as a top-level `role`
-- claim. RLS policies on principals and members reference
-- `auth.jwt() ->> 'role'` to authorise admin/superuser operations.
--
-- This migration only defines the function and the supporting grants/policy.
-- It does NOT register the hook with Supabase Auth — that is done manually
-- in the dashboard at Authentication → Hooks → "Customize Access Token (JWT)
-- Claims" → select public.custom_access_token_hook.

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
    claims := jsonb_set(claims, '{role}', to_jsonb(principal_role));
  ELSE
    claims := jsonb_set(claims, '{role}', '"none"'::jsonb);
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- The hook runs as supabase_auth_admin, so that role needs to read principals.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT SELECT ON TABLE public.principals TO supabase_auth_admin;

-- Lock everyone else out of executing the hook directly.
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;

-- RLS still applies to supabase_auth_admin's SELECT; explicit policy needed.
CREATE POLICY "Auth admin can read principals for token hook"
  ON public.principals
  FOR SELECT
  TO supabase_auth_admin
  USING (true);
