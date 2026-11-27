// A member's training history as an admin reads it: the nights they were
// signed in, newest first. A household sees its own on the training credit
// page, merged with its payments (lib/credits/history.ts). Long-standing members have years of it, so the
// page shows the most recent and says how many there are in all.

export interface AttendedSession {
  sessionId: string;
  startsAt: string;
  squad: string;
  /** What the household was charged for it: 0 at a free session, or for a member who trains free. */
  chargedPence: number;
}

/**
 * What each sign-in cost, by attendance id, from the member's session debits.
 * A sign-in with no debit cost nothing, so it's absent and reads as 0.
 */
export function chargesBySignIn(debits: { idempotency_key: string; amount_pence: number }[]): Map<string, number> {
  return new Map(
    debits
      .filter((debit) => debit.idempotency_key.startsWith('session:'))
      .map((debit) => [debit.idempotency_key.slice('session:'.length), -debit.amount_pence]),
  );
}

export const HISTORY_SHOWN = 20;

export function recentAttendance(
  sessions: AttendedSession[],
  limit: number = HISTORY_SHOWN,
): { shown: AttendedSession[]; total: number } {
  const newestFirst = [...sessions].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return { shown: newestFirst.slice(0, limit), total: sessions.length };
}

/** How far back "trained recently" looks on the members list. */
export const RECENT_TRAINING_DAYS = 28;

export function recentTrainingSince(now: Date, days: number = RECENT_TRAINING_DAYS): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
