-- principals + members
--
-- The Klubfunder export keys everything off a single contact email per row,
-- which is the household email — shared between siblings and (often) their
-- parent. Two implications:
--
--   1. One login per email, not per member. Whoever logs in sees and manages
--      everyone associated with that email.
--   2. Most members are juniors who can't log in for themselves. The parent
--      signs in on their behalf.
--
-- Schema reflects this:
--   * principals — who logs in. Keyed by email. One Supabase auth user per
--                  principal. Holds role, terms acceptance, and the credit
--                  balance.
--   * members   — who attends training. Belongs to a principal. May or may
--                  not be the principal themselves.
--
-- Klubfunder-sourced principals always end up with at least one member.
-- Manually-added principals (e.g. an admin who isn't a runner) may have
-- zero members. We don't enforce this as a DB constraint — sync logic and
-- the admin-add flow take care of the common cases.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE public.principals (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                       citext NOT NULL UNIQUE,
  auth_user_id                uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name                text NOT NULL,
  role                        text NOT NULL DEFAULT 'member'
                                 CHECK (role IN ('member', 'admin', 'superuser')),
  is_active                   boolean NOT NULL DEFAULT true,
  source                      text NOT NULL DEFAULT 'manual'
                                 CHECK (source IN ('klubfunder', 'manual')),
  terms_accepted_at           timestamptz,
  last_seen_in_klubfunder_at  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX principals_auth_user_id_idx ON public.principals(auth_user_id);

CREATE TABLE public.members (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id                    uuid NOT NULL REFERENCES public.principals(id) ON DELETE RESTRICT,
  first_name                      text NOT NULL,
  surname                         text NOT NULL,
  date_of_birth                   date NOT NULL,
  gender                          text,
  athletic_association_number     text,
  status                          text NOT NULL DEFAULT 'paid'
                                     CHECK (status IN ('paid', 'lapsed')),
  is_active                       boolean NOT NULL DEFAULT true,
  source                          text NOT NULL DEFAULT 'manual'
                                     CHECK (source IN ('klubfunder', 'manual')),
  last_seen_in_klubfunder_at      timestamptz,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX members_principal_id_idx ON public.members(principal_id);

-- AAN is unique where present, but most members don't have one.
CREATE UNIQUE INDEX members_aan_unique_idx
  ON public.members (athletic_association_number)
  WHERE athletic_association_number IS NOT NULL;

-- Shared updated_at trigger.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER principals_set_updated_at
  BEFORE UPDATE ON public.principals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER members_set_updated_at
  BEFORE UPDATE ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
