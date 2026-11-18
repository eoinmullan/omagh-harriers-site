import type { CreditTransactionType } from '@omagh/supabase';
import { formatPounds } from '@omagh/training';

export interface LedgerEntry {
  type: CreditTransactionType;
  amountPence: number;
  memberName?: string | null;
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
      return attributed('refunded', entry.recordedBy);
    case 'manual_adjustment':
      return attributed(adjustmentReason(entry.notes), entry.recordedBy);
    case 'transfer_in':
      return attributed('transferred in from another account', entry.recordedBy);
    case 'transfer_out':
      return attributed('transferred out to another account', entry.recordedBy);
  }
}

function adjustmentReason(notes?: string | null): string {
  return notes?.trim() || 'adjusted by the club';
}

function attributed(reason: string, recordedBy?: string | null): string {
  return recordedBy ? `${reason}, recorded by ${recordedBy}` : reason;
}
