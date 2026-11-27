import type { CreditTransactionType } from '../supabase/types';

// What a session actually took, and who took it.
//
// Cash for a session is the top-ups recorded against it, less anything handed
// back, plus what its guests paid at the time. Session debits are left out on
// purpose: they move credit out of a household's pot, not money into a tin,
// and counting them would make the night look twice as takings-heavy as it was.
//
// Grouping by who recorded each entry is the figure that matters when two
// phones were open on the same session and the tin does not match.

export const UNATTRIBUTED = 'Unattributed';

export interface SessionLedgerRow {
  type: CreditTransactionType;
  amountPence: number;
  recordedBy: string | null;
}

export interface SessionAttendanceRow {
  memberId: string | null;
  guestId: string | null;
  amountPaidPence: number | null;
  recordedBy: string | null;
}

export interface RecorderTotal {
  recordedBy: string;
  totalPence: number;
}

export interface SessionCash {
  totalPence: number;
  byRecorder: RecorderTotal[];
}

export interface Headcount {
  members: number;
  guests: number;
  total: number;
}

const MONEY_TYPES: readonly CreditTransactionType[] = ['top_up_cash', 'refund'];

export function summariseSessionCash(input: {
  ledger: SessionLedgerRow[];
  attendance: SessionAttendanceRow[];
}): SessionCash {
  const byRecorder = new Map<string, number>();

  const add = (recordedBy: string | null, amountPence: number) => {
    const name = recordedBy ?? UNATTRIBUTED;
    byRecorder.set(name, (byRecorder.get(name) ?? 0) + amountPence);
  };

  for (const row of input.ledger) {
    if (MONEY_TYPES.includes(row.type)) add(row.recordedBy, row.amountPence);
  }

  // Only a guest's row carries money: a member's £2 came out of the household
  // pot, so it is already in the ledger and must not be counted twice.
  for (const row of input.attendance) {
    if (row.guestId && row.amountPaidPence) add(row.recordedBy, row.amountPaidPence);
  }

  return {
    totalPence: [...byRecorder.values()].reduce((total, pence) => total + pence, 0),
    byRecorder: [...byRecorder.entries()]
      .map(([recordedBy, totalPence]) => ({ recordedBy, totalPence }))
      .sort(
        (a, b) =>
          b.totalPence - a.totalPence || a.recordedBy.localeCompare(b.recordedBy, 'en-GB'),
      ),
  };
}

export function countHeads(attendance: SessionAttendanceRow[]): Headcount {
  const members = attendance.filter((row) => row.memberId).length;
  const guests = attendance.filter((row) => row.guestId).length;
  return { members, guests, total: members + guests };
}

/**
 * Several sessions added together, for a day that ran more than one: "how did
 * Monday go?" Each session's own figures come from the rules above, so a day
 * can only ever add up what its sessions say.
 */
export function rollUpSessions(sessions: { heads: Headcount; cash: SessionCash }[]): {
  heads: Headcount;
  cash: SessionCash;
} {
  const byRecorder = new Map<string, number>();
  for (const { cash } of sessions) {
    for (const line of cash.byRecorder) {
      byRecorder.set(line.recordedBy, (byRecorder.get(line.recordedBy) ?? 0) + line.totalPence);
    }
  }

  const members = sessions.reduce((total, session) => total + session.heads.members, 0);
  const guests = sessions.reduce((total, session) => total + session.heads.guests, 0);

  return {
    heads: { members, guests, total: members + guests },
    cash: {
      totalPence: sessions.reduce((total, session) => total + session.cash.totalPence, 0),
      byRecorder: [...byRecorder.entries()]
        .map(([recordedBy, totalPence]) => ({ recordedBy, totalPence }))
        .sort((a, b) => b.totalPence - a.totalPence || a.recordedBy.localeCompare(b.recordedBy, 'en-GB')),
    },
  };
}
