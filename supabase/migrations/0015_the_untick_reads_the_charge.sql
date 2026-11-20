-- the untick reverses the charge it actually made
--
-- `undo_member_sign_in` has always found the debit it is reversing — it has to,
-- to know whether anything was taken at all — and then thrown it away, keeping
-- only a boolean. The reversal was rebuilt from two other places: the member's
-- household as it stands today, and the session's price as it stands today.
-- Both can have moved since the charge was written.
--
-- The household is the one that bites. When the Klubfunder sync moves a member
-- between households it re-points `members.principal_id` and leaves the ledger
-- alone, which is right: the old household is the one that paid. But an untick
-- of any sign-in from before the move credited the member's *new* household. The
-- one that paid stayed down by the session price and the other went up by it —
-- two wrong balances from one tap, in an append-only ledger, correctable only by
-- a compensating pair that somebody has to notice is needed.
--
-- The price is narrower but the same shape. `planSessionEdit` settles the price
-- once anyone has signed in, but the admin page counts the attendance and then
-- issues the update as a second statement, so a tick landing between the two
-- slips a change through. The untick then gave back the new price against a
-- charge made at the old one.
--
-- So: take both off the row being reversed. Money goes back to the pot it came
-- out of, at the figure that left it, because that is the row the function is
-- already holding. Neither failure mode can be reintroduced by a later change to
-- prices or to households, and there is no new rule to remember — the old ones
-- are gone.
--
-- `v_refund_pence` also replaces `v_charged`. A NULL means no debit was found,
-- which is the free session and the tick whose charge never landed, and both
-- want the same answer: nothing was taken, so nothing goes back.
--
-- Everything else is `0014` unaltered. `members` and `groups` are still read,
-- but only for the names in the note, where a stale label is harmless.

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
  v_refund_pence integer;
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

  -- The charge being reversed. How much was taken, and whose pot it came out
  -- of, both read from the row that recorded it.
  SELECT t.principal_id, -t.amount_pence
    INTO v_principal_id, v_refund_pence
  FROM public.credit_transactions t
  WHERE t.idempotency_key = 'session:' || p_attendance_id;

  -- Labels for the note, and nothing the arithmetic depends on.
  SELECT m.first_name INTO v_first_name
  FROM public.members m
  WHERE m.id = v_member_id;

  SELECT g.name INTO v_group_name
  FROM public.training_sessions s
  JOIN public.groups g ON g.id = s.group_id
  WHERE s.id = v_session_id;

  DELETE FROM public.attendance WHERE id = p_attendance_id;

  -- Spelled out rather than left to `v_refund_pence > 0` alone: a NULL there
  -- would make the IF neither true nor false, which is the trap `0013` was
  -- written to close.
  IF v_refund_pence IS NOT NULL AND v_refund_pence > 0 THEN
    INSERT INTO public.credit_transactions (
      principal_id, member_id, amount_pence, type, idempotency_key, created_by, session_id, notes
    )
    VALUES (
      v_principal_id,
      v_member_id,
      v_refund_pence,
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
