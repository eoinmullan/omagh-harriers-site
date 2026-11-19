import type { CreditTransactionInsert, CreditTransactionType } from '../supabase/types';

// Money handed over at the track.
//
// The row shows one figure per runner: what that household has handed over
// tonight. Getting from the figure on screen to the one the registrar wants is
// the ledger's problem, not theirs — they say what it should be and the right
// row is written to make it so.

export interface CashRow {
  principalId: string;
  type: CreditTransactionType;
  amountPence: number;
}

const MONEY_TYPES: readonly CreditTransactionType[] = ['top_up_cash', 'refund'];

/**
 * What a household has handed over tonight, net of anything handed back.
 *
 * Cash is a household fact, like the balance it feeds. £10 given for one of
 * three siblings reads the same on all three rows, because it is the same £10
 * going into the same pot.
 */
export function cashTonight(rows: CashRow[], principalId: string): number {
  return rows
    .filter((row) => row.principalId === principalId && MONEY_TYPES.includes(row.type))
    .reduce((total, row) => total + row.amountPence, 0);
}

/** Everything taken tonight, which is the figure the tin is checked against. */
export function moneyCollected(rows: CashRow[]): number {
  return rows
    .filter((row) => MONEY_TYPES.includes(row.type))
    .reduce((total, row) => total + row.amountPence, 0);
}

export function householdsWhoPaid(rows: CashRow[]): Set<string> {
  const paid = new Set<string>();
  for (const row of rows) {
    if (MONEY_TYPES.includes(row.type)) paid.add(row.principalId);
  }
  return new Set([...paid].filter((principalId) => cashTonight(rows, principalId) !== 0));
}

/**
 * The row that moves tonight's figure from what it is to what it should be.
 *
 * More money is a `top_up_cash`. Less is a **`refund`**, never a negative
 * top-up: the sign CHECK forbids one, and `manual_adjustment` would be both
 * unattached to the session and misleading on the member's page. `refund` is
 * already constrained negative and already means money going back out, so the
 * night's total nets itself without anything having to know about this.
 *
 * `member_id` is left null on purpose. The money belongs to the household;
 * `created_by` and `session_id` say who took it and where. Only `session`
 * debits name a member.
 */
export function planCashChange(request: {
  currentPence: number;
  targetPence: number;
  principalId: string;
  sessionId: string;
  recordedBy: string;
  /** Minted once per action and reused on retry, so a resend writes nothing. */
  clientId: string;
}): CreditTransactionInsert | undefined {
  if (request.targetPence < 0) return undefined;

  const difference = request.targetPence - request.currentPence;
  if (difference === 0) return undefined;

  const takingMoney = difference > 0;

  return {
    principal_id: request.principalId,
    member_id: null,
    amount_pence: difference,
    type: takingMoney ? 'top_up_cash' : 'refund',
    idempotency_key: `${takingMoney ? 'cash' : 'refund'}:${request.principalId}:${request.clientId}`,
    created_by: request.recordedBy,
    session_id: request.sessionId,
    notes: takingMoney ? 'Cash at training' : 'Cash handed back at training',
  };
}

// The notes and coins that actually change hands. Anything else is keyed in.
export const QUICK_AMOUNTS_PENCE = [200, 500, 1000, 2000] as const;

const MOST_ANYONE_HANDS_OVER_PENCE = 100_000;

/**
 * Digits shift in from the right, the way a card machine takes an amount, so
 * there is no decimal point to place in the cold and the dark. Typing 1, 0, 0
 * gives £1.00.
 */
export function appendDigit(pence: number, digit: string): number {
  if (!/^[0-9]$/.test(digit)) return pence;

  const next = pence * 10 + Number(digit);
  return next > MOST_ANYONE_HANDS_OVER_PENCE ? pence : next;
}

/** The backspace: the last digit falls off the right. */
export function dropDigit(pence: number): number {
  return Math.floor(pence / 10);
}
