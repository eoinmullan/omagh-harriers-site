import {
  describeEntry,
  describeFreeSession,
  isCredit,
  summariseEntry,
  summariseFreeSession,
  type LedgerEntry,
} from './transactions';

// A household's history: every payment, correction and session, newest first.
//
// It used to be two pages, a credit statement and a training history, and
// they were mostly the same record: every paid session is already a line on
// the statement. What only the training history had was the sessions that
// cost nothing, which leave no ledger row, so they're added here as lines of
// their own. Nothing a member was signed in at goes missing.

export type HistoryKind = 'credit' | 'debit' | 'free';

export interface HistoryLine {
  id: string;
  /** The whole line as one sentence, for screen readers. */
  description: string;
  /** What it was, in a few words. */
  title: string;
  /** Who, and who recorded it. */
  detail: string;
  /** Signed: money in is positive. Zero for a session that cost nothing. */
  amountPence: number;
  /** The day it belongs to: the session's night, or when it was recorded. */
  on: string;
  kind: HistoryKind;
  /** When it happened, for ordering and for the date shown under the line. */
  at: string;
  /** Whose line it is, for the filter. Null for the household's own money. */
  memberId: string | null;
}

export interface LedgerLine {
  id: string;
  entry: LedgerEntry;
  createdAt: string;
  memberId: string | null;
}

export interface FreeSession {
  attendanceId: string;
  memberId: string;
  memberName: string;
  squad: string | null;
  startsAt: string;
}

export function householdHistory(sources: { ledger: LedgerLine[]; freeSessions: FreeSession[] }): HistoryLine[] {
  const lines: HistoryLine[] = [
    ...sources.ledger.map((line) => ({
      id: line.id,
      description: describeEntry(line.entry),
      ...summariseEntry(line.entry),
      amountPence: line.entry.amountPence,
      on: line.entry.sessionStartsAt ?? line.createdAt,
      kind: (isCredit(line.entry) ? 'credit' : 'debit') as HistoryKind,
      at: line.createdAt,
      memberId: line.memberId,
    })),
    ...sources.freeSessions.map((session) => ({
      id: session.attendanceId,
      description: describeFreeSession(session),
      ...summariseFreeSession(session),
      amountPence: 0,
      on: session.startsAt,
      kind: 'free' as const,
      at: session.startsAt,
      memberId: session.memberId,
    })),
  ];

  return lines.sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Who in the household has lines of their own, for the filter.
 *
 * The filter only helps when there's a choice: a household of one, or one
 * where only one member trains, would be offered a single name. So the page
 * shows it only when this returns two or more.
 */
export function membersWithLines(
  lines: HistoryLine[],
  names: Map<string, string>,
): { memberId: string; name: string }[] {
  const ids = [...new Set(lines.flatMap((line) => (line.memberId ? [line.memberId] : [])))];
  return ids
    .map((memberId) => ({ memberId, name: names.get(memberId) ?? 'A member' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
}

/** One member's lines: their sessions and anything corrected for them. */
export function linesFor(lines: HistoryLine[], memberId: string | null): HistoryLine[] {
  return memberId ? lines.filter((line) => line.memberId === memberId) : lines;
}

/**
 * Lines grouped by the month they were recorded in, newest first, the way a
 * bank statement reads on a phone. Keeps the order the lines came in.
 */
export function byMonth(lines: HistoryLine[]): { month: string; lines: HistoryLine[] }[] {
  const months: { month: string; lines: HistoryLine[] }[] = [];
  for (const line of lines) {
    const month = new Date(line.at).toLocaleDateString('en-GB', {
      timeZone: 'Europe/London',
      month: 'long',
      year: 'numeric',
    });
    const last = months[months.length - 1];
    if (last?.month === month) last.lines.push(line);
    else months.push({ month, lines: [line] });
  }
  return months;
}
