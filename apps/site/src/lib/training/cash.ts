import { cashLabel } from '../credits/cash-label';
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

/**
 * Everything taken tonight, which is the figure the tin is checked against.
 *
 * Two halves, and leaving either out makes the tin wrong. Members' money is in
 * the ledger as `top_up_cash` less `refund`; a guest has no pot, so what they
 * handed over sits on their attendance row. `session-cash.ts` computes the same
 * figure for the admin screen and must keep agreeing with this one.
 */
export function moneyCollected(rows: CashRow[], guestPaymentsPence: (number | null)[] = []): number {
  const fromMembers = rows
    .filter((row) => MONEY_TYPES.includes(row.type))
    .reduce((total, row) => total + row.amountPence, 0);

  const fromGuests = guestPaymentsPence.reduce<number>(
    (total, pence) => total + (pence ?? 0),
    0,
  );

  return fromMembers + fromGuests;
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

/**
 * What the cash sheet's save button says.
 *
 * The sheet edits the total a household has handed over tonight, so the
 * button describes the change to that total. It used to describe the
 * difference as something done at the gate, "Take £5" or "Give back £5", which
 * is wrong whenever the change is a correction: a £5 typed as the £10 that was
 * actually handed over isn't another £5 taken. The sheet can't tell a
 * correction from more money changing hands, so it says what will be recorded
 * and leaves what happened to the registrar, who saw it.
 */
export function describeCashChange(currentPence: number, targetPence: number): string {
  if (targetPence === currentPence) return 'No change';
  if (currentPence === 0) return `Record ${cashLabel(targetPence)}`;
  if (targetPence === 0) return `Remove the ${cashLabel(currentPence)}`;
  return `Change ${cashLabel(currentPence)} to ${cashLabel(targetPence)}`;
}

/**
 * The small word under the cash a household has handed over, on each of its
 * members' rows.
 *
 * Cash belongs to the household, so every sibling's row shows the same
 * figure. Under each of two Bennetts, "£10 added" reads as £10 each, and a
 * registrar adding up the column gets twice what's in the tin. "£10 for both"
 * says it's one £10 covering the two of them. A household of one keeps
 * "added", because there is nobody else for it to be confused with.
 */
export function cashCaption(householdSize: number): string {
  if (householdSize <= 1) return 'added';
  if (householdSize === 2) return 'for both';
  return `for all ${householdSize}`;
}

/** How many members each household has, by household id. */
export function householdSizes(members: { principalId: string }[]): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const member of members) sizes.set(member.principalId, (sizes.get(member.principalId) ?? 0) + 1);
  return sizes;
}
