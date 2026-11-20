-- an untick always finds its row, and a charged sign-in never leaves without
-- its money
--
-- Two findings from the round 1 data-integrity review, fixed together because
-- both live in the same two functions.
--
-- 1. An untick could be aimed at a row that never existed.
--
-- A phone mints the attendance id when the finger comes off the screen, so an
-- untick can name its row while the tick is still queued. But `sign_in_member`
-- inserts with ON CONFLICT DO NOTHING on (member, session). If the other phone
-- at the gate had already signed that runner in, the insert writes nothing and
-- the function returns the other phone's row, Y. The registrar app discards
-- that return value. So when this phone later unticks, it asks for its own id,
-- X, which no row ever carried. `undo_member_sign_in` treated that as "already
-- undone" and returned success. Y stayed, and so did its £2: the household was
-- charged for a runner the registrar had said was not there.
--
-- The obvious fix is to fall back to (member, session) when the id finds
-- nothing. It is wrong, because the queue retries forever. If A's untick lands
-- but its response is lost, B ticks the runner in again (row Z), and A retries,
-- the fallback finds Z and deletes a sign-in nobody wanted undone.
--
-- So the tick writes down what it learned. When `sign_in_member` is handed an
-- id and finds a different row already there, it records alias X -> Y. The
-- untick follows the alias. The alias cascades with Y: once Y is gone, X means
-- nothing again, so a replayed untick finds no row and does nothing, and Z is
-- safe. Every key derives from the real row's id, so two phones unticking the
-- same runner still credit once (`untick:Y`). The registrar app does not
-- change.
--
-- 2. A registrar could delete a sign-in and keep the money.
--
-- The RPCs exist so that an attendance row and its charge cannot come apart.
-- But the RLS policy "Registrars and admins can delete attendance" (0010) is
-- not limited to guests, so a direct REST delete could remove a member's
-- attendance and leave the session debit on the ledger. The app never does
-- that; its only direct delete filters on guest_id. Any registrar's token
-- could, though.
--
-- Restricting the policy to guests would also refuse the untick, which is
-- SECURITY INVOKER and deletes under the caller's RLS. So the rule moves onto
-- the row instead. A BEFORE DELETE trigger refuses to remove a member's
-- attendance whose `session:{id}` debit exists without an `untick:{id}`
-- reversal. The untick now writes the reversal first and deletes second, so it
-- passes its own check. A guest's row and an uncharged member's row (a free
-- session) carry no money and delete freely. Getting the money back is now a
-- precondition for the row going, not just something the RPC happens to do.

CREATE TABLE public.attendance_aliases (
  alias_id      uuid PRIMARY KEY,
  attendance_id uuid NOT NULL REFERENCES public.attendance(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.attendance_aliases IS
  'An attendance id a phone minted, mapped to the row that was already there '
  'when it signed the runner in. Lets that phone''s untick find the real row. '
  'Cascades with the row, so a replayed untick after the row is gone does '
  'nothing.';

CREATE INDEX attendance_aliases_attendance_id_idx
  ON public.attendance_aliases (attendance_id);

ALTER TABLE public.attendance_aliases ENABLE ROW LEVEL SECURITY;

-- Written and read only inside the two RPCs, which run as the caller.
CREATE POLICY "Registrars and admins can read attendance aliases"
  ON public.attendance_aliases FOR SELECT TO authenticated
  USING (public.can_run_a_session());

CREATE POLICY "Registrars and admins can record attendance aliases"
  ON public.attendance_aliases FOR INSERT TO authenticated
  WITH CHECK (public.can_run_a_session());

REVOKE ALL ON public.attendance_aliases FROM anon;

-- The money leaves with the row, or the row stays -------------------------

CREATE OR REPLACE FUNCTION public.refuse_to_drop_a_charged_sign_in()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.member_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.credit_transactions
       WHERE idempotency_key = 'session:' || OLD.id
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.credit_transactions
       WHERE idempotency_key = 'untick:' || OLD.id
     )
  THEN
    RAISE EXCEPTION
      'That sign-in was charged. Undo it with undo_member_sign_in, which gives the money back.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER attendance_keeps_its_money
  BEFORE DELETE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.refuse_to_drop_a_charged_sign_in();

-- sign_in_member: as 0013, plus the alias --------------------------------

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

  -- The phone named a row and got a different one back: the other phone got
  -- there first. Record what this phone's id now means, so its untick can
  -- find the row.
  IF p_attendance_id IS NOT NULL AND p_attendance_id <> v_attendance_id THEN
    INSERT INTO public.attendance_aliases (alias_id, attendance_id)
    VALUES (p_attendance_id, v_attendance_id)
    ON CONFLICT DO NOTHING;
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

-- undo_member_sign_in: as 0017, but it follows an alias, and it gives the
-- money back before it removes the row ---------------------------------------

CREATE OR REPLACE FUNCTION public.undo_member_sign_in(p_attendance_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id     uuid;
  v_row_id       uuid;
  v_member_id    uuid;
  v_session_id   uuid;
  v_principal_id uuid;
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

  -- The row this phone named, or failing that, the row its id was found to
  -- mean when it ticked.
  SELECT a.id, a.member_id, a.session_id INTO v_row_id, v_member_id, v_session_id
  FROM public.attendance a
  WHERE a.id = p_attendance_id;

  IF v_row_id IS NULL THEN
    SELECT a.id, a.member_id, a.session_id INTO v_row_id, v_member_id, v_session_id
    FROM public.attendance_aliases al
    JOIN public.attendance a ON a.id = al.attendance_id
    WHERE al.alias_id = p_attendance_id;
  END IF;

  -- Neither: already undone, by an earlier attempt or by the other phone.
  IF v_row_id IS NULL THEN
    RETURN;
  END IF;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'That is a guest. Delete the attendance row instead.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT t.principal_id, -t.amount_pence
    INTO v_principal_id, v_refund_pence
  FROM public.credit_transactions t
  WHERE t.idempotency_key = 'session:' || v_row_id;

  SELECT g.name INTO v_group_name
  FROM public.training_sessions s
  JOIN public.groups g ON g.id = s.group_id
  WHERE s.id = v_session_id;

  -- Money first, so that the delete below satisfies attendance_keeps_its_money.
  IF v_refund_pence IS NOT NULL AND v_refund_pence > 0 THEN
    INSERT INTO public.credit_transactions (
      principal_id, member_id, amount_pence, type, idempotency_key, created_by, session_id, notes
    )
    VALUES (
      v_principal_id,
      v_member_id,
      v_refund_pence,
      'manual_adjustment',
      'untick:' || v_row_id,
      v_actor_id,
      v_session_id,
      COALESCE(v_group_name, 'Training') || ' sign-in corrected'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  DELETE FROM public.attendance WHERE id = v_row_id;
END;
$$;
