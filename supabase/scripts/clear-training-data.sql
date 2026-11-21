-- Clear every training session, sign-in, guest and ledger row before go-live.
--
-- Run once, in the Supabase SQL Editor, when the test nights are over and before
-- the club relies on any of it. It keeps everything that is real: households,
-- members, logins, roles, squads and who trains with which squad. Every
-- household's balance goes back to £0.00, because a balance is only the sum of
-- the ledger.
--
-- TRUNCATE doesn't fire the row triggers that guard the ledger and attendance,
-- so it can clear them; nothing short of the table owner can run it. It is
-- irreversible once committed. Supabase's daily backup is the only way back.
--
-- Run as it is, it's a dry run: it clears everything, then stops with an error
-- that lists what it cleared, and the error undoes all of it. The SQL Editor
-- shows only the last result, which is why the counts come back as an error.
-- It clears for real only with the confirmation line uncommented, because
-- pasting this by mistake after go-live would erase the club's money.

BEGIN;

-- SET LOCAL omagh.confirm = 'clear all training data';

CREATE TEMP TABLE cleared ON COMMIT DROP AS
SELECT format(
  'sessions %s, sign-ins %s, guests %s, ledger rows %s, households not at £0.00 %s',
  (SELECT count(*) FROM public.training_sessions),
  (SELECT count(*) FROM public.attendance),
  (SELECT count(*) FROM public.guests),
  (SELECT count(*) FROM public.credit_transactions),
  (SELECT count(*) FROM public.principal_balances WHERE balance_pence <> 0)
) AS summary;

TRUNCATE public.attendance_aliases,
         public.attendance,
         public.credit_transactions,
         public.training_sessions,
         public.guests;

DO $$
DECLARE
  what_was_cleared text := (SELECT summary FROM cleared);
  kept text := format('Kept: households %s, members %s, squads %s, squad places %s',
    (SELECT count(*) FROM public.principals),
    (SELECT count(*) FROM public.members),
    (SELECT count(*) FROM public.groups),
    (SELECT count(*) FROM public.member_groups));
BEGIN
  IF current_setting('omagh.confirm', true) IS DISTINCT FROM 'clear all training data' THEN
    RAISE EXCEPTION 'Dry run, nothing changed. Would clear: %. %.', what_was_cleared, kept;
  END IF;
END
$$;

COMMIT;

SELECT 'Cleared the training data. Every balance is now £0.00.' AS result;
