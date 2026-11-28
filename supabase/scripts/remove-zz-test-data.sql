-- Remove the ZZ test records, and everything that hangs off them.
--
-- Run in the Supabase SQL Editor, which runs as the table owner. Nothing else
-- can do this: the ledger's append-only trigger refuses every DELETE, the
-- service-role key included, and `attendance_keeps_its_money` refuses to drop a
-- charged sign-in. This script switches both off inside its own transaction and
-- back on before it ends. ALTER TABLE is transactional, so if anything fails the
-- triggers come back with everything else.
--
-- What counts as ZZ: a squad or household whose name starts "ZZ ", a session in
-- a ZZ squad or whose note starts "ZZ ", a member of a ZZ household or whose
-- surname starts "ZZ-", and a guest whose surname starts "ZZ-". The match is
-- case-sensitive, so a real name starting "Zz" is never caught.
--
-- Run as it is, it's a dry run: it does every delete, then stops with an error
-- that lists what it removed, and the error undoes all of it. The SQL Editor
-- shows only the last result, which is why the counts come back as an error.
-- On 21 November 2026 they were: squads 2, sessions 4, households 1,
-- members 1, guests 1, ledger rows 11, sign-ins 1, ledger rows on real
-- households 0, logins 0.
-- If they match, uncomment the SET LOCAL line and run it again.

BEGIN;

-- SET LOCAL omagh.confirm = 'remove zz test data';

CREATE TEMP TABLE zz_groups ON COMMIT DROP AS
  SELECT id FROM public.groups WHERE name LIKE 'ZZ %';

CREATE TEMP TABLE zz_sessions ON COMMIT DROP AS
  SELECT id FROM public.training_sessions
  WHERE group_id IN (SELECT id FROM zz_groups) OR note LIKE 'ZZ %';

CREATE TEMP TABLE zz_principals ON COMMIT DROP AS
  SELECT id, auth_user_id FROM public.principals
  WHERE display_name LIKE 'ZZ %' AND source = 'manual';

CREATE TEMP TABLE zz_members ON COMMIT DROP AS
  SELECT id FROM public.members
  WHERE principal_id IN (SELECT id FROM zz_principals) OR surname LIKE 'ZZ-%';

CREATE TEMP TABLE zz_guests ON COMMIT DROP AS
  SELECT id FROM public.guests WHERE surname LIKE 'ZZ-%';

CREATE TEMP TABLE zz_ledger ON COMMIT DROP AS
  SELECT id, principal_id FROM public.credit_transactions
  WHERE session_id IN (SELECT id FROM zz_sessions)
     OR principal_id IN (SELECT id FROM zz_principals)
     OR counterparty_principal_id IN (SELECT id FROM zz_principals)
     OR member_id IN (SELECT id FROM zz_members);

CREATE TEMP TABLE zz_attendance ON COMMIT DROP AS
  SELECT id FROM public.attendance
  WHERE session_id IN (SELECT id FROM zz_sessions)
     OR member_id IN (SELECT id FROM zz_members)
     OR guest_id IN (SELECT id FROM zz_guests);

-- Openings of a ZZ member's emergency contact, or by a ZZ login (0026). The
-- log has no foreign keys, so nothing else would remove them.
CREATE TEMP TABLE zz_openings ON COMMIT DROP AS
SELECT id FROM public.emergency_contact_openings
WHERE member_id IN (SELECT id FROM zz_members)
   OR opened_by IN (SELECT id FROM zz_principals);

CREATE TEMP TABLE zz_counts ON COMMIT DROP AS
SELECT format(
  'squads %s, sessions %s, households %s, members %s, guests %s, ledger rows %s, sign-ins %s, '
  'ledger rows on real households %s, logins %s, emergency contact openings %s',
  (SELECT count(*) FROM zz_groups),
  (SELECT count(*) FROM zz_sessions),
  (SELECT count(*) FROM zz_principals),
  (SELECT count(*) FROM zz_members),
  (SELECT count(*) FROM zz_guests),
  (SELECT count(*) FROM zz_ledger),
  (SELECT count(*) FROM zz_attendance),
  (SELECT count(*) FROM zz_ledger WHERE principal_id NOT IN (SELECT id FROM zz_principals)),
  (SELECT count(*) FROM zz_principals WHERE auth_user_id IS NOT NULL),
  (SELECT count(*) FROM zz_openings)
) AS removed;

ALTER TABLE public.credit_transactions DISABLE TRIGGER credit_transactions_append_only;
ALTER TABLE public.attendance DISABLE TRIGGER attendance_keeps_its_money;
ALTER TABLE public.emergency_contact_openings DISABLE TRIGGER emergency_contact_openings_append_only;

DELETE FROM public.credit_transactions WHERE id IN (SELECT id FROM zz_ledger);
-- attendance_aliases go with their rows (ON DELETE CASCADE).
DELETE FROM public.attendance WHERE id IN (SELECT id FROM zz_attendance);
DELETE FROM public.emergency_contact_openings WHERE id IN (SELECT id FROM zz_openings);
DELETE FROM public.training_sessions WHERE id IN (SELECT id FROM zz_sessions);
-- member_groups go with their member or squad (ON DELETE CASCADE).
DELETE FROM public.groups WHERE id IN (SELECT id FROM zz_groups);
DELETE FROM public.guests WHERE id IN (SELECT id FROM zz_guests);
DELETE FROM public.members WHERE id IN (SELECT id FROM zz_members);
DELETE FROM public.principals WHERE id IN (SELECT id FROM zz_principals);
DELETE FROM auth.users WHERE id IN (SELECT auth_user_id FROM zz_principals WHERE auth_user_id IS NOT NULL);

ALTER TABLE public.credit_transactions ENABLE TRIGGER credit_transactions_append_only;
ALTER TABLE public.attendance ENABLE TRIGGER attendance_keeps_its_money;
ALTER TABLE public.emergency_contact_openings ENABLE TRIGGER emergency_contact_openings_append_only;

DO $$
DECLARE
  what_was_removed text := (SELECT removed FROM zz_counts);
  left_over int := (SELECT count(*) FROM public.groups WHERE name LIKE 'ZZ %')
                 + (SELECT count(*) FROM public.principals WHERE display_name LIKE 'ZZ %')
                 + (SELECT count(*) FROM public.guests WHERE surname LIKE 'ZZ-%');
BEGIN
  IF left_over > 0 THEN
    RAISE EXCEPTION 'Some ZZ records are still there, so nothing was changed.';
  END IF;
  IF current_setting('omagh.confirm', true) IS DISTINCT FROM 'remove zz test data' THEN
    RAISE EXCEPTION 'Dry run, nothing changed. Would remove: %.', what_was_removed;
  END IF;
END
$$;

COMMIT;

SELECT 'Removed the ZZ test data.' AS result;
