-- signing a member in, and taking it back
--
-- A tick is two rows in two tables: the attendance row, and the £2 leaving the
-- household's pot. PostgREST cannot span two tables in one statement, so two
-- calls from a phone on leisure-centre wifi could leave a runner marked present
-- and never charged, or charged and not marked present. A function is one
-- transaction, so it is both or neither.
--
-- Everything here is SECURITY INVOKER, which is the default and is deliberate.
-- RLS already says who may write attendance and ledger rows (0010), and a
-- SECURITY DEFINER function would have to restate that rule and then be the
-- place it goes stale. The explicit role check at the top of each function is
-- only there to turn a silent RLS denial into a sentence; it is not the gate.

-- sign_in_member ----------------------------------------------------------
--
-- Returns the attendance row's id, which is what the caller keys an untick
-- off later.
--
-- `p_attendance_id` is optional and exists for the offline queue: a phone that
-- decides the row's identity at tick time can retry the same call for hours
-- without risk, because every key below is derived from ids that were fixed
-- before the queue was written. Left out, the server picks one.
--
-- Idempotency is the whole point. `ON CONFLICT DO NOTHING` is untargeted on
-- purpose: attendance carries both a unique `idempotency_key` and a unique
-- (member_id, session_id), and a retry could trip either. CHECK violations
-- still raise, which is what we want — a malformed row is a bug, not a retry.

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
  IF NOT public.can_run_a_session() THEN
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

  -- Cancelled is a soft disable, and attendance against one would contradict
  -- the reason it was cancelled.
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

  -- Nothing came back, so this runner was already signed in — by an earlier
  -- attempt of this same call, or by the other phone at the gate. Pick up the
  -- row that is there and carry on to the charge, which has its own key and
  -- will no-op if it was already written.
  IF v_attendance_id IS NULL THEN
    SELECT a.id INTO v_attendance_id
    FROM public.attendance a
    WHERE a.idempotency_key = v_key;
  END IF;

  IF v_attendance_id IS NULL THEN
    RAISE EXCEPTION 'Could not record that sign-in.' USING ERRCODE = 'P0001';
  END IF;

  -- A free session is attendance and nothing else. credit_transactions is
  -- CHECK (amount_pence <> 0), so a zero debit cannot be written whatever we
  -- decide — writing one unconditionally here would take the whole tick down,
  -- in front of a queue.
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

-- undo_member_sign_in -----------------------------------------------------
--
-- The untick, and the other half of the same atomicity problem: the attendance
-- row goes, and the £2 has to come back, and a phone that managed only one of
-- those would be lying to somebody.
--
-- The money comes back as a `manual_adjustment`, not a `refund`. The sign CHECK
-- forbids a positive refund, and more importantly a refund means cash leaving
-- the tin — it is counted in the night's takings, which is exactly what this is
-- not. `manual_adjustment` is free to go either way and is invisible to that
-- total. The note carries the explanation.
--
-- Keyed `untick:{attendance_id}`, so a double-tapped undo credits once. A
-- re-tick mints a fresh attendance row with a fresh id, so unticking *that* is a
-- different key and correctly credits again.

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
  IF NOT public.can_run_a_session() THEN
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

  -- Already undone, by an earlier attempt or the other phone. Saying nothing is
  -- the right answer: the registrar wanted this runner not signed in, and they
  -- are not signed in.
  IF v_member_id IS NULL AND v_session_id IS NULL THEN
    RETURN;
  END IF;

  -- A guest's row carries their cash on it, so deleting it takes the money with
  -- it and there is no ledger entry to reverse. That is a plain delete through
  -- PostgREST and does not belong here.
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

  -- Only give back what was actually taken. A free session left no debit, and
  -- neither did a tick whose charge never landed.
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

-- The anon key calls these as a signed-in person; nothing else needs them.
REVOKE ALL ON FUNCTION public.sign_in_member(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.undo_member_sign_in(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.sign_in_member(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_member_sign_in(uuid) TO authenticated;
