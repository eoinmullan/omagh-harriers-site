-- a session that costs nothing
--
-- Some sessions are free: a taster night, a club championship, a junior session
-- the club decides not to charge for. 0009 forbade a zero price, and gave its
-- reason in a comment: "a zero-price session could produce no ledger row at
-- all, since credit_transactions refuses a zero amount."
--
-- That was treated as the thing to prevent. It is now the behaviour we want. A
-- free session records attendance and writes no ledger row, which is not a
-- preference but the only thing the schema permits — credit_transactions is
-- CHECK (amount_pence <> 0), so a zero debit cannot exist whatever anybody
-- decides. The same holds for the reversal in 0011: nothing was taken, so
-- nothing is given back.
--
-- A guest at a free session is an attendance row with `amount_paid_pence` NULL
-- rather than 0 — the column is nullable but CHECK (amount_paid_pence > 0), so
-- a zero is refused where an absent figure is fine. "They paid nothing" and "we
-- are not recording what they paid" are the same fact here, and no change is
-- needed for it.
--
-- Nothing else moves. `sign_in_member` already branches on the price.

ALTER TABLE public.training_sessions
  DROP CONSTRAINT IF EXISTS training_sessions_price_pence_check;

ALTER TABLE public.training_sessions
  ADD CONSTRAINT training_sessions_price_pence_check
  CHECK (price_pence >= 0);

COMMENT ON COLUMN public.training_sessions.price_pence IS
  'What a runner is charged, copied from the code constant at creation so a '
  'later change never rewrites a session that has already run. Zero is a free '
  'session: attendance is recorded and no ledger row is written, because '
  'credit_transactions refuses a zero amount.';
