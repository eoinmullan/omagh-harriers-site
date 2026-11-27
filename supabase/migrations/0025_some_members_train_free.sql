-- some members train free
--
-- Coaches, life members and whoever else the committee decides don't pay for
-- sessions. It's a setting on the member, not the household, because siblings
-- can differ: one trains free while the other pays from the household's
-- credit. It lasts until an admin turns it off, and it carries a short reason
-- so the next committee knows why.
--
-- A free member's sign-in is recorded and nothing is taken, exactly as at a
-- free session (0012): attendance is written, the debit is not. So the untick
-- (0019) finds no `session:{id}` charge and gives nothing back, and the
-- `attendance_keeps_its_money` trigger lets the row go. Turning the setting
-- off charges from the next sign-in; earlier sign-ins stay free, because
-- nothing was taken for them.
--
-- The registrar app reads `trains_free` to draw an infinity sign in place of
-- the balance, so it joins the column grant (0018). The reason is for admins,
-- who read members with the service role, and stays out of the grant.

ALTER TABLE public.members
  ADD COLUMN trains_free boolean NOT NULL DEFAULT false,
  ADD COLUMN trains_free_reason text,
  ADD CONSTRAINT members_trains_free_reason_only_while_free
    CHECK (trains_free OR trains_free_reason IS NULL),
  ADD CONSTRAINT members_trains_free_reason_not_blank
    CHECK (trains_free_reason IS NULL OR length(btrim(trains_free_reason)) > 0);

COMMENT ON COLUMN public.members.trains_free IS
  'Signs in without being charged. Set by an admin; lasts until turned off.';
COMMENT ON COLUMN public.members.trains_free_reason IS
  'Why this member trains free, as the admin typed it. Only while trains_free.';

GRANT SELECT (trains_free) ON public.members TO authenticated;

-- sign_in_member: as 0019, but no debit for a member who trains free -------

CREATE OR REPLACE FUNCTION public.sign_in_member(
  p_member_id uuid,
  p_session_id uuid,
  p_attendance_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id       uuid;
  v_principal_id   uuid;
  v_price_pence    integer;
  v_is_cancelled   boolean;
  v_key            text;
  v_attendance_id  uuid;
  v_trains_free    boolean;
BEGIN
  IF public.can_run_a_session() IS NOT TRUE THEN
    RAISE EXCEPTION 'Only a registrar, admin or superuser can sign runners in.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.id INTO v_actor_id
  FROM public.principals p
  WHERE p.auth_user_id = auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No principal is attached to this sign-in.' USING ERRCODE = '42501';
  END IF;

  SELECT s.price_pence, s.is_cancelled INTO v_price_pence, v_is_cancelled
  FROM public.training_sessions s
  WHERE s.id = p_session_id;

  IF v_price_pence IS NULL THEN
    RAISE EXCEPTION 'That session no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  IF v_is_cancelled THEN
    RAISE EXCEPTION 'That session was cancelled.' USING ERRCODE = 'P0001';
  END IF;

  SELECT m.principal_id, m.trains_free INTO v_principal_id, v_trains_free
  FROM public.members m
  WHERE m.id = p_member_id;

  IF v_principal_id IS NULL THEN
    RAISE EXCEPTION 'That member no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  v_key := 'attendance:' || p_member_id || ':' || p_session_id;

  INSERT INTO public.attendance (id, session_id, member_id, recorded_by, idempotency_key)
  VALUES (
    COALESCE(p_attendance_id, gen_random_uuid()),
    p_session_id,
    p_member_id,
    v_actor_id,
    v_key
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_attendance_id;

  IF v_attendance_id IS NULL THEN
    SELECT a.id INTO v_attendance_id
    FROM public.attendance a
    WHERE a.idempotency_key = v_key;
  END IF;

  IF v_attendance_id IS NULL THEN
    RAISE EXCEPTION 'Could not record that sign-in.' USING ERRCODE = 'P0001';
  END IF;

  -- The phone named a row and got a different one back: the other phone got
  -- there first. Record what this phone's id now means, so its untick can
  -- find the row.
  IF p_attendance_id IS NOT NULL AND p_attendance_id <> v_attendance_id THEN
    INSERT INTO public.attendance_aliases (alias_id, attendance_id)
    VALUES (p_attendance_id, v_attendance_id)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Somebody who trains free is signed in like anybody else; only the charge
  -- is left out, as at a free session.
  IF v_price_pence > 0 AND v_trains_free IS NOT TRUE THEN
    INSERT INTO public.credit_transactions (
      principal_id, member_id, amount_pence, type, idempotency_key, created_by, session_id
    )
    VALUES (
      v_principal_id,
      p_member_id,
      -v_price_pence,
      'session',
      'session:' || v_attendance_id,
      v_actor_id,
      p_session_id
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_attendance_id;
END;
$$;
