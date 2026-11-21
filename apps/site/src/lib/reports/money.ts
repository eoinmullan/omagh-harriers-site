import type { CreditTransactionType } from '../supabase/types';
import { UNATTRIBUTED } from '../training/session-cash';

// Money that changed hands over a range of days: what reached the tin, and
// what an admin recorded away from training.
//
// The cash rule is the one `session-cash.ts` uses for a single night: cash
// top-ups, less what was handed back, plus what guests paid. A session's own
// £2 debit is not money: it moves credit out of a household's pot. Transfers
// and adjustments move credit between pots or correct it, so they are not
// money either.
//
// Money taken at a session is dated by that session, so a night put right the
// next day still lands on the night. Money an admin recorded away from
// training is dated when it was recorded.

export type MoneyKind =
  | 'cash at training'
  | 'guest payments'
  | 'handed back at training'
  | 'cash recorded by an admin'
  | 'refunded by an admin';

export const MONEY_KINDS: readonly MoneyKind[] = [
  'cash at training',
  'guest payments',
  'handed back at training',
  'cash recorded by an admin',
  'refunded by an admin',
];

export function ledgerMoneyKind(type: CreditTransactionType, atASession: boolean): MoneyKind | undefined {
  if (type === 'top_up_cash') return atASession ? 'cash at training' : 'cash recorded by an admin';
  if (type === 'refund') return atASession ? 'handed back at training' : 'refunded by an admin';
  return undefined;
}

export interface MoneyEntry {
  kind: MoneyKind;
  amountPence: number;
  recordedBy: string | null;
}

export interface MoneySummary {
  totalPence: number;
  byKind: { kind: MoneyKind; totalPence: number; entries: number }[];
  byRecorder: { recordedBy: string; totalPence: number }[];
}

export function summariseMoney(entries: MoneyEntry[]): MoneySummary {
  const byRecorder = new Map<string, number>();
  for (const entry of entries) {
    const name = entry.recordedBy ?? UNATTRIBUTED;
    byRecorder.set(name, (byRecorder.get(name) ?? 0) + entry.amountPence);
  }

  return {
    totalPence: entries.reduce((total, entry) => total + entry.amountPence, 0),
    byKind: MONEY_KINDS.map((kind) => {
      const ofKind = entries.filter((entry) => entry.kind === kind);
      return {
        kind,
        totalPence: ofKind.reduce((total, entry) => total + entry.amountPence, 0),
        entries: ofKind.length,
      };
    }).filter((line) => line.entries > 0),
    byRecorder: [...byRecorder.entries()]
      .map(([recordedBy, totalPence]) => ({ recordedBy, totalPence }))
      .sort((a, b) => b.totalPence - a.totalPence || a.recordedBy.localeCompare(b.recordedBy, 'en-GB')),
  };
}
