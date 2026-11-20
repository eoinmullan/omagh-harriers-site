-- the ledger names nobody
--
-- `credit_transactions` is append-only: a trigger refuses UPDATE and DELETE,
-- service role included. That is what makes it trustworthy as a ledger. It also
-- means anything written into it stays for good, and three paths were writing
-- people's names into `notes`:
--
--   - the untick, as "Middle Distance sign-in corrected for James", which puts a
--     child's first name in the row;
--   - a transfer's outgoing row, as "Transferred to <other household> — ...";
--   - a transfer's incoming row, as "Transferred from <other household> — ...".
--
-- None of those names could ever be removed. Not by an erasure request, and not
-- by the anonymisation the club will need to build, because blanking a person's
-- details on `members` and `principals` cannot reach text frozen into the
-- ledger. The transfer case was the worse of the two, because it wrote one
-- household's name onto another household's statement.
--
-- So the ledger records ids, and a statement turns them into names when it is
-- read. Anonymise the member or the household, and every line that mentioned
-- them changes with it.
--
-- `member_id` already names the runner on an untick row, so the note now says
-- only which squad's sign-in was corrected, and the statement adds "for James
-- Conway" from the member. A transfer gains `counterparty_principal_id`, the
-- household on the other side, and its note keeps only the admin's reason.
--
-- Every row in the database today is test data, so this costs nothing now. The
-- five untick rows already written keep their old notes, because nothing can
-- change them. That is exactly the problem, shown on a small scale.

ALTER TABLE public.credit_transactions
  ADD COLUMN counterparty_principal_id uuid REFERENCES public.principals(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.credit_transactions.counterparty_principal_id IS
  'The household on the other side of a transfer. Set on transfer_in and '
  'transfer_out rows only. Stored as an id rather than a name, so that '
  'anonymising that household reaches every statement that mentions it.';

-- Only a transfer has another side, and a transfer must always say who it was.
-- No transfer rows exist yet, so this validates against the table as it is.
ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_only_a_transfer_has_a_counterparty CHECK (
    (type IN ('transfer_in', 'transfer_out')) = (counterparty_principal_id IS NOT NULL)
  );

-- The untick, unchanged from `0015` except for the note. It no longer reads the
-- member's first name, because it no longer writes it.

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

  -- The squad, for the note. A squad's name is not about any one person.
  SELECT g.name INTO v_group_name
  FROM public.training_sessions s
  JOIN public.groups g ON g.id = s.group_id
  WHERE s.id = v_session_id;

  DELETE FROM public.attendance WHERE id = p_attendance_id;

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
      COALESCE(v_group_name, 'Training') || ' sign-in corrected'
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
