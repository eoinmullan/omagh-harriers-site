import type { Headcount, SessionCash } from '../training/session-cash';

// Every session on one day rolled together, which is how a committee member
// asks the question: "how did Monday go?" Each session's own figures come
// from `session-cash.ts`, so the day can only ever add up what the nights say.

export interface DaySession {
  heads: Headcount;
  cash: SessionCash;
}

export interface DayTotals {
  heads: Headcount;
  cash: SessionCash;
}

export function rollUpDay(sessions: DaySession[]): DayTotals {
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

