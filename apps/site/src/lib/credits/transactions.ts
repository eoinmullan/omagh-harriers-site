import type { CreditTransactionType } from '../supabase/types';
import { formatPounds } from './money';

// Names arrive here from the rows a statement joins, never from the ledger's
// own notes: the ledger is append-only, so it holds ids and this is where they
// become people. `counterpartyName` is left out on a member's own statement,
// which says "another account" rather than naming somebody else's household.
export interface LedgerEntry {
  type: CreditTransactionType;
  amountPence: number;
  memberName?: string | null;
  counterpartyName?: string | null;
  recordedBy?: string | null;
  notes?: string | null;
}

export function isCredit(entry: LedgerEntry): boolean {
  return entry.amountPence > 0;
}

export function describeEntry(entry: LedgerEntry): string {
  const movement = isCredit(entry) ? 'added' : 'deducted';
  return `${formatPounds(entry.amountPence)} ${movement} — ${reasonFor(entry)}`;
}

function reasonFor(entry: LedgerEntry): string {
  switch (entry.type) {
    case 'top_up_stripe':
      return 'paid by card via Stripe';
    case 'top_up_cash':
      return attributed('paid by cash at training', entry.recordedBy);
    case 'session':
      return entry.memberName ? `training session for ${entry.memberName}` : 'training session';
    case 'refund':
      // A refund carries its reason the way an adjustment does. "£10.00
      // deducted — refunded" does not say why, and a keying slip corrected in
      // front of the member deserves a sentence they can check against the
      // evening they remember.
      return attributed(noteOr(entry.notes, 'refunded'), entry.recordedBy);
    case 'manual_adjustment':
      // Only the untick sets a member on an adjustment, and its note names the
      // squad, not the runner. The runner comes from the member row.
      return attributed(
        forMember(noteOr(entry.notes, 'adjusted by the club'), entry.memberName),
        entry.recordedBy,
      );
    case 'transfer_in':
      return attributed(
        `transferred in from ${entry.counterpartyName ?? 'another account'}`,
        entry.recordedBy,
      );
    case 'transfer_out':
      return attributed(
        `transferred out to ${entry.counterpartyName ?? 'another account'}`,
        entry.recordedBy,
      );
  }
}

function forMember(reason: string, memberName?: string | null): string {
  return memberName ? `${reason} for ${memberName}` : reason;
}

function noteOr(notes: string | null | undefined, fallback: string): string {
  return notes?.trim() || fallback;
}

function attributed(reason: string, recordedBy?: string | null): string {
  return recordedBy ? `${reason}, recorded by ${recordedBy}` : reason;
}
