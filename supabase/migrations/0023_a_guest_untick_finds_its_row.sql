-- a guest's untick finds its own row, as a member's does since 0019
--
-- Finding D4-1 from the round 4 data-integrity review.
--
-- The registrar app unticked a guest by deleting whatever row matched the
-- guest and the session. 0019 explained why that is wrong for members, and the
-- reasoning is the same for guests: the queue retries forever. If phone A's
-- untick lands but its response is lost, phone B ticks the guest back in, and
-- A retries, the retry finds B's row and deletes it. A guest's money lives on
-- their attendance row, so the £2 they handed over goes with it, and the tin
-- comes out £2 over with nothing to say why.
--
-- So guests get what members got. The phone mints the attendance id when the
-- finger comes off the screen and sends it with the tick. If the other phone
-- got there first, the tick records an alias from this phone's id to the row
-- that was already there. The untick deletes by id, or by the alias, and never
-- by (guest, session). Once the row is gone the alias goes with it, so a
-- replayed untick finds nothing and a later re-tick is safe.
--
-- What a guest paid now comes from the session's price on the server, the
-- same figure sign_in_member charges a member, rather than from the phone.
--
-- SECURITY INVOKER, like 0011's functions: RLS already says a registrar may
-- insert and delete attendance and record an alias, and a definer function
-- would restate that rule and be where it goes stale. The role check at the
-- top only turns a silent RLS refusal into a sentence, and it is written
-- IS NOT TRUE because a token with no app_role makes it NULL (see 0013).

CREATE OR REPLACE FUNCTION public.sign_in_guest(
  p_guest_id uuid,
  p_session_id uuid,
  p_attendance_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id      uuid;
  v_price_pence   integer;
  v_is_cancelled  boolean;
  v_key           text;
  v_attendance_id uuid;
BEGIN
  IF public.can_run_a_session() IS NOT TRUE THEN
    RAISE EXCEPTION 'Only a registrar, admin or superuser can sign guests in.'
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

  IF NOT EXISTS (SELECT 1 FROM public.guests g WHERE g.id = p_guest_id) THEN
    RAISE EXCEPTION 'That guest no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  v_key := 'attendance:guest:' || p_guest_id || ':' || p_session_id;

  -- A free session records NULL, not 0: the column is checked > 0.
  INSERT INTO public.attendance (id, session_id, guest_id, amount_paid_pence, recorded_by, idempotency_key)
  VALUES (
    COALESCE(p_attendance_id, gen_random_uuid()),
    p_session_id,
    p_guest_id,
    NULLIF(v_price_pence, 0),
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

  -- The other phone got there first. Record what this phone's id now means,
  -- so its untick can find the row.
  IF p_attendance_id IS NOT NULL AND p_attendance_id <> v_attendance_id THEN
    INSERT INTO public.attendance_aliases (alias_id, attendance_id)
    VALUES (p_attendance_id, v_attendance_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_attendance_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_guest_sign_in(p_attendance_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row_id    uuid;
  v_member_id uuid;
BEGIN
  IF public.can_run_a_session() IS NOT TRUE THEN
    RAISE EXCEPTION 'Only a registrar, admin or superuser can undo a sign-in.'
      USING ERRCODE = '42501';
  END IF;

  SELECT a.id, a.member_id INTO v_row_id, v_member_id
  FROM public.attendance a
  WHERE a.id = p_attendance_id;

  IF v_row_id IS NULL THEN
    SELECT a.id, a.member_id INTO v_row_id, v_member_id
    FROM public.attendance_aliases al
    JOIN public.attendance a ON a.id = al.attendance_id
    WHERE al.alias_id = p_attendance_id;
  END IF;

  -- Neither: already undone, by an earlier attempt or by the other phone.
  IF v_row_id IS NULL THEN
    RETURN;
  END IF;

  IF v_member_id IS NOT NULL THEN
    RAISE EXCEPTION 'That is a member. Undo it with undo_member_sign_in, which gives the money back.'
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.attendance WHERE id = v_row_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sign_in_guest(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.undo_guest_sign_in(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.sign_in_guest(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_guest_sign_in(uuid) TO authenticated;
