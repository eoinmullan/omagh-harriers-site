-- the role guard, made to mean what it says
--
-- `0011` opened both functions with `IF NOT public.can_run_a_session() THEN
-- RAISE`. For a caller whose token carries no `app_role` claim at all,
-- `current_app_role()` is NULL, so `can_run_a_session()` is NULL, and `NOT
-- NULL` is NULL rather than true — the guard does not fire and execution falls
-- through to the next check.
--
-- Found by calling the functions with the anon key after pushing `0011`: the
-- error that came back was "No principal is attached to this sign-in", which is
-- the *second* check. The first had been skipped.
--
-- Nothing was ever exposed by it. An anon caller has no `auth.uid()`, so the
-- principal lookup stops them, and every insert inside still has to satisfy the
-- RLS policies from `0010`, which gate on the same function and refuse a NULL
-- just as firmly. The hole would only matter if a signed-in member's token
-- somehow lacked the claim — if the access token hook were disabled, say — and
-- then RLS would still refuse the writes while this function waved them
-- through to a confusing error.
--
-- It is still wrong. A guard that reads as "only a registrar may pass" should
-- not depend on the claim being present to do its job, and the next function
-- written by copying this one might not have RLS behind it.

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
BEGIN
  -- IS NOT TRUE, not NOT: a missing claim is a refusal, not a shrug.
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

  SELECT m.principal_id INTO v_principal_id
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

  IF v_price_pence > 0 THEN
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
  v_session_name text;
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

  SELECT s.name, s.price_pence INTO v_session_name, v_price_pence
  FROM public.training_sessions s
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
      COALESCE(v_session_name, 'Training') || ' sign-in corrected for ' || COALESCE(v_first_name, 'a member')
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
