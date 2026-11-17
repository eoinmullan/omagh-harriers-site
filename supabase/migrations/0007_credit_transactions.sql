-- training credits
--
-- Balances are held per principal — the household — not per member. A parent
-- tops up once and any of their members draw from the same pot, which is how
-- the club already thinks about it.
--
-- The balance is never stored. It is the sum of this ledger, so a top-up and a
-- session debit can't disagree with each other. Rows are append-only:
-- a mistake is corrected by a compensating row, not by editing history. The
-- trigger below enforces that even against the service-role key.
--
-- `idempotency_key` is what makes the sign-in PWA safe to retry on leisure
-- centre wifi: the same key twice is one row, not two charges.

CREATE TABLE public.credit_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id     uuid NOT NULL REFERENCES public.principals(id) ON DELETE RESTRICT,
  member_id        uuid REFERENCES public.members(id) ON DELETE RESTRICT,
  amount_pence     integer NOT NULL CHECK (amount_pence <> 0),
  type             text NOT NULL
                     CHECK (type IN ('top_up_stripe', 'top_up_cash', 'session',
                                     'manual_adjustment', 'refund',
                                     'transfer_in', 'transfer_out')),
  idempotency_key  text NOT NULL UNIQUE,
  notes            text,
  -- Null for the rows the system writes itself, such as a Stripe webhook.
  -- RESTRICT rather than SET NULL: a ledger line keeps the admin who wrote it,
  -- and the append-only trigger would refuse the cascade anyway.
  created_by       uuid REFERENCES public.principals(id) ON DELETE RESTRICT,
  created_at       timestamptz NOT NULL DEFAULT now(),

  -- Money in is positive, money out is negative. Only a manual adjustment is
  -- free to go either way, because that is its whole purpose.
  CONSTRAINT credit_transactions_amount_sign_matches_type CHECK (
    CASE type
      WHEN 'top_up_stripe' THEN amount_pence > 0
      WHEN 'top_up_cash'   THEN amount_pence > 0
      WHEN 'transfer_in'   THEN amount_pence > 0
      WHEN 'session'       THEN amount_pence < 0
      WHEN 'transfer_out'  THEN amount_pence < 0
      WHEN 'refund'        THEN amount_pence < 0
      ELSE true
    END
  )
);

CREATE INDEX credit_transactions_principal_id_created_at_idx
  ON public.credit_transactions (principal_id, created_at DESC);

CREATE INDEX credit_transactions_member_id_idx
  ON public.credit_transactions (member_id)
  WHERE member_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.forbid_credit_transaction_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'credit_transactions is append-only — correct a mistake with a compensating row';
END;
$$;

CREATE TRIGGER credit_transactions_append_only
  BEFORE UPDATE OR DELETE ON public.credit_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.forbid_credit_transaction_rewrite();

-- balances ----------------------------------------------------------------
--
-- Every principal appears, including those who have never transacted, so the
-- members area can show a zero balance without a special case.
--
-- security_invoker makes the view obey the caller's RLS on the tables beneath
-- it rather than the view owner's. Without it this view would hand any signed-in
-- member the whole club's balances.

CREATE VIEW public.principal_balances
  WITH (security_invoker = true)
AS
SELECT
  p.id                                        AS principal_id,
  COALESCE(SUM(t.amount_pence), 0)::bigint    AS balance_pence,
  MAX(t.created_at)                           AS last_transaction_at
FROM public.principals p
LEFT JOIN public.credit_transactions t ON t.principal_id = p.id
GROUP BY p.id;
