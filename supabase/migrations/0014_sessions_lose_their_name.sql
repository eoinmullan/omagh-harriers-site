-- a session is a squad and a time, with a note if there is something to say
--
-- `name` and `location` were asked for when the schema was drawn and have
-- earned nothing since. Every session the club has actually created proves it:
-- the registrar app names one after its own group, and the one created by hand
-- was called "Wed", which says less than the start time already does. A field
-- that is either a duplicate or a shrug is a field to remove.
--
-- What is left identifies a session completely: the squad it is for and when it
-- started. `groups.name` is the label everywhere now.
--
-- `note` replaces both, and is nullable because most nights have nothing to
-- say. One free line covers what `location` was reaching for ("top car park")
-- and the things it never could ("juniors only", "coaches away, easy run").

ALTER TABLE public.training_sessions DROP COLUMN name;
ALTER TABLE public.training_sessions DROP COLUMN location;
ALTER TABLE public.training_sessions ADD COLUMN note text;

COMMENT ON COLUMN public.training_sessions.note IS
  'Anything worth saying about this one night — where to meet, who it is for, '
  'why it is different. Null on almost every session.';

-- The untick's note named the session. There is no session name any more, so
-- it names the squad: "Middle Distance sign-in corrected for Jack". Only the
-- two SELECTs change; everything else is `0013` unaltered.

CREATE OR REPLACE FUNCTION public.undo_member_sign_in(p_attendance_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id     uuid;
  v_member_id    uuid;
  v_session_id   uuid;
  v_principal_id uuid;
  v_first_name   text;
  v_group_name   text;
  v_price_pence  integer;
  v_charged      boolean;
BEGIN
  IF public.can_run_a_session() IS NOT TRUE THEN
    RAISE EXCEPTION 'Only a registrar, admin or superuser can undo a sign-in.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.id INTO v_actor_id
  FROM public.principals p
  WHERE p.auth_user_id = auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No principal is attached to this sign-in.' USING ERRCODE = '42501';
  END IF;

  SELECT a.member_id, a.session_id INTO v_member_id, v_session_id
  FROM public.attendance a
  WHERE a.id = p_attendance_id;

  IF v_member_id IS NULL AND v_session_id IS NULL THEN
    RETURN;
  END IF;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'That is a guest. Delete the attendance row instead.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT m.principal_id, m.first_name INTO v_principal_id, v_first_name
  FROM public.members m
  WHERE m.id = v_member_id;

  SELECT g.name, s.price_pence INTO v_group_name, v_price_pence
  FROM public.training_sessions s
  JOIN public.groups g ON g.id = s.group_id
  WHERE s.id = v_session_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.credit_transactions t
    WHERE t.idempotency_key = 'session:' || p_attendance_id
  ) INTO v_charged;

  DELETE FROM public.attendance WHERE id = p_attendance_id;

  IF v_charged AND v_price_pence > 0 THEN
    INSERT INTO public.credit_transactions (
      principal_id, member_id, amount_pence, type, idempotency_key, created_by, session_id, notes
    )
    VALUES (
      v_principal_id,
      v_member_id,
      v_price_pence,
      'manual_adjustment',
      'untick:' || p_attendance_id,
      v_actor_id,
      v_session_id,
      COALESCE(v_group_name, 'Training') || ' sign-in corrected for ' || COALESCE(v_first_name, 'a member')
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
