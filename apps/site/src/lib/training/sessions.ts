import { DEFAULT_SESSION_PRICE_PENCE } from '../credits/ledger';
import type { TrainingSessionInsert, TrainingSessionUpdate } from '@omagh/supabase';
import { formatPounds, parseClubDateTime, parsePounds } from '@omagh/training';

// What may be written to `training_sessions`, decided here so the admin pages
// decide nothing. Same shape as `credits/ledger.ts`: a form in, either a row
// to write or one sentence for the admin out.

export interface SessionGroup {
  id: string;
  name: string;
  isActive: boolean;
}

export interface PricedSession {
  name: string;
  location: string | null;
  pricePence: number;
  isCancelled: boolean;
}

export type SessionCreation = { insert: TrainingSessionInsert } | { problem: string };
export type SessionChange = { update: TrainingSessionUpdate } | { problem: string };

export function planNewSession(request: {
  name: string;
  groupId: string;
  startsAt: string;
  location: string;
  price: string;
  groups: SessionGroup[];
  createdBy: string;
}): SessionCreation {
  const name = request.name.trim();
  if (!name) return { problem: 'Give the session a name.' };

  const group = request.groups.find((candidate) => candidate.id === request.groupId);
  if (!group) return { problem: 'Choose the group this session is for.' };
  if (!group.isActive) {
    return { problem: `${group.name} is retired. Bring it back before running sessions for it.` };
  }

  const startsAt = parseClubDateTime(request.startsAt);
  if (!startsAt) return { problem: 'Give the date and time the session starts.' };

  // Blank means the usual price. The session keeps its own copy from here on,
  // so editing the constant never rewrites a session that has already run.
  const pricePence = resolvePrice(request.price, DEFAULT_SESSION_PRICE_PENCE);
  if (!pricePence) return { problem: priceProblem(DEFAULT_SESSION_PRICE_PENCE) };

  return {
    insert: {
      name,
      group_id: group.id,
      starts_at: startsAt,
      location: request.location.trim() || null,
      price_pence: pricePence,
      created_by: request.createdBy,
    },
  };
}

export function planSessionEdit(request: {
  session: PricedSession;
  name: string;
  location: string;
  price: string;
  // Sign-ins already recorded against the session. Each one put a debit in
  // the ledger at the price below, and the ledger cannot be edited.
  attendanceCount: number;
}): SessionChange {
  const name = request.name.trim();
  if (!name) return { problem: 'Give the session a name.' };

  const pricePence = resolvePrice(request.price, request.session.pricePence);
  if (!pricePence) return { problem: priceProblem(request.session.pricePence) };

  if (pricePence !== request.session.pricePence && request.attendanceCount > 0) {
    return { problem: priceIsSettledMessage(request.session.pricePence, request.attendanceCount) };
  }

  const location = request.location.trim() || null;
  if (name === request.session.name && location === request.session.location && pricePence === request.session.pricePence) {
    return { problem: 'Nothing was changed.' };
  }

  return { update: { name, location, price_pence: pricePence } };
}

// Cancelling is a soft-disable: the attendance and the ledger rows behind it
// have to keep meaning something.
export function planCancellation(session: PricedSession): SessionChange {
  if (session.isCancelled) return { problem: `${session.name} is already cancelled.` };
  return { update: { is_cancelled: true } };
}

export function planReinstatement(session: PricedSession): SessionChange {
  if (!session.isCancelled) return { problem: `${session.name} is not cancelled.` };
  return { update: { is_cancelled: false } };
}

export interface TimedSession {
  startsAt: string;
}

/**
 * Upcoming soonest-first, because the next session is the one being set up;
 * past most-recent-first, because last night is the one being checked.
 */
export function partitionByStart<T extends TimedSession>(
  sessions: T[],
  now: Date = new Date(),
): { upcoming: T[]; past: T[] } {
  const boundary = now.getTime();
  const byStart = (a: T, b: T) => Date.parse(a.startsAt) - Date.parse(b.startsAt);

  return {
    upcoming: sessions.filter((s) => Date.parse(s.startsAt) >= boundary).sort(byStart),
    past: sessions.filter((s) => Date.parse(s.startsAt) < boundary).sort((a, b) => byStart(b, a)),
  };
}

function resolvePrice(input: string, fallbackPence: number): number | undefined {
  return input.trim() ? parsePounds(input) : fallbackPence;
}

function priceProblem(fallbackPence: number): string {
  return `Enter the price in pounds, or leave it blank for ${formatPounds(fallbackPence)}.`;
}

function priceIsSettledMessage(pricePence: number, attendanceCount: number): string {
  const runners = attendanceCount === 1 ? 'one runner has' : `${attendanceCount} runners have`;
  return `${runners} already signed in at ${formatPounds(pricePence)}. The ledger records what they were charged, so the price stays as it is — cancel this session and create another if it was wrong.`;
}
