-- Emergency contacts (Phase 8): who may open them, what they hold, and a
-- record of every opening.
--
-- Access is a flag of its own on a login, not a role. Nobody holds it by being
-- a coach, a registrar or an admin, so the list of who can see these details
-- is the list of logins with the flag. It travels in the access token as
-- `emergency_contacts`, beside `app_role`, so the app can decide what to draw
-- with no signal, and RLS reads it from there too.

-- the flag ----------------------------------------------------------------

ALTER TABLE public.principals
  ADD COLUMN opens_emergency_contacts boolean NOT NULL DEFAULT false;

-- The middleware reads it on the signed-in login's own row, to draw the
-- section switcher. Readable as `role` already is (0018): who holds the flag
-- says nothing about anybody's child.
GRANT SELECT (opens_emergency_contacts) ON public.principals TO authenticated;

-- The hook, as 0004 left it, plus the flag. A login with no household gets
-- false, as it gets `none` for its role.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  claims jsonb;
  principal_role text;
  opens_contacts boolean;
BEGIN
  SELECT role, opens_emergency_contacts INTO principal_role, opens_contacts
  FROM public.principals
  WHERE auth_user_id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';

  IF principal_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_role}', to_jsonb(principal_role));
  ELSE
    claims := jsonb_set(claims, '{app_role}', '"none"'::jsonb);
  END IF;

  claims := jsonb_set(claims, '{emergency_contacts}', to_jsonb(coalesce(opens_contacts, false)));

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- NULL-safe: a token with no claim is false, never NULL, so a guard written
-- `IS NOT TRUE` or a policy reading it refuses as it should.
CREATE OR REPLACE FUNCTION public.opens_emergency_contacts()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((auth.jwt() ->> 'emergency_contacts')::boolean, false);
$$;

-- what a flag holder reads besides the contacts ---------------------------
--
-- Tonight's sessions, who is signed in to them, and every member's name, as
-- the registrar app reads them. Names only: the column grants from 0018 still
-- decide which columns any login sees.

CREATE POLICY "Emergency contact holders can read all sessions"
  ON public.training_sessions
  FOR SELECT
  TO authenticated
  USING ((select public.opens_emergency_contacts()));

CREATE POLICY "Emergency contact holders can read all attendance"
  ON public.attendance
  FOR SELECT
  TO authenticated
  USING ((select public.opens_emergency_contacts()));

CREATE POLICY "Emergency contact holders can read all members"
  ON public.members
  FOR SELECT
  TO authenticated
  USING ((select public.opens_emergency_contacts()));

CREATE POLICY "Emergency contact holders can read guests"
  ON public.guests
  FOR SELECT
  TO authenticated
  USING ((select public.opens_emergency_contacts()));

-- the contacts ------------------------------------------------------------
--
-- One per member, from the Klubfunder export's parent or guardian name and
-- number, until the safeguarding form decides what else belongs here. Written
-- only by the sync, through the service role, so there's no write policy.

CREATE TABLE public.emergency_contacts (
  member_id     uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  contact_name  text CHECK (contact_name IS NULL OR btrim(contact_name) <> ''),
  contact_phone text NOT NULL CHECK (btrim(contact_phone) <> ''),
  source        text NOT NULL DEFAULT 'klubfunder' CHECK (source IN ('klubfunder')),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER emergency_contacts_set_updated_at
  BEFORE UPDATE ON public.emergency_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.emergency_contacts FROM anon, authenticated;
GRANT SELECT ON public.emergency_contacts TO authenticated;

CREATE POLICY "Emergency contact holders can read emergency contacts"
  ON public.emergency_contacts
  FOR SELECT
  TO authenticated
  USING ((select public.opens_emergency_contacts()));

-- the record of every opening ---------------------------------------------
--
-- Who opened which member's contacts, and when. Nobody reads it through the
-- site for now; it's there for an incident, a complaint or a subject access
-- request.
--
-- Append-only like the ledger: UPDATE, DELETE and TRUNCATE are refused,
-- service-role key included. The project's owner can still switch the
-- triggers off in the SQL Editor, as the test-data scripts do. That's written
-- down in the plan rather than pretended away.
--
-- No foreign keys, on purpose. A log has to outlive what it names: RESTRICT
-- would stop a member or login ever being deleted, and SET NULL would be an
-- UPDATE, which the log refuses.
--
-- The id is minted on the phone, so an opening queued offline and retried
-- lands once. `opened_at` is the phone's clock at the tap; `recorded_at` is
-- when it reached the database, which can be hours later.

CREATE TABLE public.emergency_contact_openings (
  id          uuid PRIMARY KEY,
  opened_by   uuid NOT NULL,
  member_id   uuid NOT NULL,
  opened_at   timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX emergency_contact_openings_member_idx
  ON public.emergency_contact_openings (member_id, opened_at);

CREATE OR REPLACE FUNCTION public.forbid_emergency_contact_opening_rewrite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'emergency_contact_openings is append-only';
END;
$$;

CREATE TRIGGER emergency_contact_openings_append_only
  BEFORE UPDATE OR DELETE ON public.emergency_contact_openings
  FOR EACH ROW
  EXECUTE FUNCTION public.forbid_emergency_contact_opening_rewrite();

CREATE TRIGGER emergency_contact_openings_no_truncate
  BEFORE TRUNCATE ON public.emergency_contact_openings
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.forbid_emergency_contact_opening_rewrite();

ALTER TABLE public.emergency_contact_openings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.emergency_contact_openings FROM anon, authenticated;
GRANT INSERT ON public.emergency_contact_openings TO authenticated;

-- A login records its own openings and nobody else's. It doesn't have to hold
-- the flag any more: an opening queued offline the day before the flag was
-- taken away still belongs in the log. No SELECT policy, so nothing reads it
-- back through the API.
CREATE POLICY "A login records its own openings"
  ON public.emergency_contact_openings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    opened_by IN (SELECT id FROM public.principals WHERE auth_user_id = (select auth.uid()))
  );
