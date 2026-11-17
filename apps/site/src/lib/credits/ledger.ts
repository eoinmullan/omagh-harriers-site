import type { CreditTransactionInsert } from '../supabase/types';
import { formatPounds, parsePounds } from './money';

// A transfer only needs to know who the other household is. Its balance is
// the source's business, not the target's.
export interface TransferTarget {
  id: string;
  displayName: string;
}

export interface Household extends TransferTarget {
  balancePence: number;
}

// Either rows ready to insert or the one sentence to show the admin. The page
// decides nothing: every rule about what may be written lives here.
export type LedgerWrite = { rows: CreditTransactionInsert[] } | { problem: string };

export interface CashTopUpRequest {
  household: Household;
  amount: string;
  note: string;
  recordedBy: string;
  idempotencyKey: string;
}

export interface AdjustmentRequest extends CashTopUpRequest {
  direction: string;
}

export interface SessionDebitRequest extends CashTopUpRequest {
  // Resolved by the caller from the household's own members, so a crafted post
  // cannot charge one household's session to another household's child.
  memberId: string | null;
}

export interface TransferRequest {
  source: Household;
  target: TransferTarget | undefined;
  amount: string;
  note: string;
  recordedBy: string;
  idempotencyKey: string;
}

export function planCashTopUp(request: CashTopUpRequest): LedgerWrite {
  const amountPence = parsePounds(request.amount);
  if (!amountPence) return { problem: 'Enter the amount paid, in pounds.' };

  return {
    rows: [
      {
        principal_id: request.household.id,
        amount_pence: amountPence,
        type: 'top_up_cash',
        idempotency_key: request.idempotencyKey,
        notes: trimmedOrNull(request.note),
        created_by: request.recordedBy,
      },
    ],
  };
}

// The club has charged £2 a session for years. Changing it is a one-line edit
// and a deploy, which beats a settings table nobody would open.
export const DEFAULT_SESSION_PRICE_PENCE = 200;

export function planSessionDebit(request: SessionDebitRequest): LedgerWrite {
  const amountPence = parsePounds(request.amount);
  if (!amountPence) return { problem: 'Enter the session charge, in pounds.' };

  return {
    rows: [
      {
        principal_id: request.household.id,
        member_id: request.memberId,
        amount_pence: -amountPence,
        type: 'session',
        idempotency_key: request.idempotencyKey,
        notes: trimmedOrNull(request.note),
        created_by: request.recordedBy,
      },
    ],
  };
}

export function planAdjustment(request: AdjustmentRequest): LedgerWrite {
  const amountPence = parsePounds(request.amount);
  if (!amountPence) return { problem: 'Enter the amount to adjust by, in pounds.' };

  if (request.direction !== 'add' && request.direction !== 'remove') {
    return { problem: 'Choose whether to add or remove credit.' };
  }

  const note = trimmedOrNull(request.note);
  if (!note) return { problem: 'An adjustment needs a note explaining it.' };

  return {
    rows: [
      {
        principal_id: request.household.id,
        amount_pence: request.direction === 'add' ? amountPence : -amountPence,
        type: 'manual_adjustment',
        idempotency_key: request.idempotencyKey,
        notes: note,
        created_by: request.recordedBy,
      },
    ],
  };
}

// The pair is written by a single multi-row insert, so Postgres applies both
// sides or neither. Two separate inserts could strand money in nobody's
// account, and the ledger is append-only — there would be no taking it back.
export function planTransfer(request: TransferRequest): LedgerWrite {
  const { source, target } = request;

  if (!target) return { problem: 'Choose the household to transfer the balance to.' };
  if (target.id === source.id) {
    return { problem: 'Choose a different household to transfer to.' };
  }

  const note = trimmedOrNull(request.note);
  if (!note) return { problem: 'A transfer needs a note explaining it.' };

  if (source.balancePence <= 0) {
    return { problem: `${source.displayName} has no balance to transfer.` };
  }

  const amountPence = request.amount.trim() ? parsePounds(request.amount) : source.balancePence;
  if (!amountPence) return { problem: 'Enter an amount in pounds, or leave it blank to move the whole balance.' };

  if (amountPence > source.balancePence) {
    return {
      problem: `${source.displayName} only holds ${formatPounds(source.balancePence)}.`,
    };
  }

  return {
    rows: [
      {
        principal_id: source.id,
        amount_pence: -amountPence,
        type: 'transfer_out',
        idempotency_key: `${request.idempotencyKey}:out`,
        notes: `Transferred to ${target.displayName} — ${note}`,
        created_by: request.recordedBy,
      },
      {
        principal_id: target.id,
        amount_pence: amountPence,
        type: 'transfer_in',
        idempotency_key: `${request.idempotencyKey}:in`,
        notes: `Transferred from ${source.displayName} — ${note}`,
        created_by: request.recordedBy,
      },
    ],
  };
}

function trimmedOrNull(note: string): string | null {
  return note.trim() || null;
}
