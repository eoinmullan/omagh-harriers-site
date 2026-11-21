import { DEFAULT_SESSION_PRICE_PENCE } from '../credits/ledger';
import { formatPounds, parsePounds } from '../credits/money';
import type { TrainingSessionInsert, TrainingSessionUpdate } from '../supabase/types';
import { clubDayKey, parseClubDateTime } from './club-time';

// What may be written to `training_sessions`, decided here so the admin pages
// decide nothing.
//
// A session has no name and no location: it is a squad and a time, which says
// everything a name was ever used to say. `note` is the one free line, for the
// night that needs something said about it. Same shape as `credits/ledger.ts`: a form in, either a row
// to write or one sentence for the admin out.

export interface SessionGroup {
  id: string;
  name: string;
  isActive: boolean;
}

export interface PricedSession {
  note: string | null;
  pricePence: number;
  isCancelled: boolean;
}

export type SessionCreation = { insert: TrainingSessionInsert } | { problem: string };
export type SessionChange = { update: TrainingSessionUpdate } | { problem: string };

// Most sessions start on the hour, and nobody trains at 3am, so the start is
// picked from a short list rather than typed minute by minute. Quarter hours
// cover the odd 18:30 or 19:15.
export const DEFAULT_SESSION_START_TIME = '18:00';
const FIRST_START_HOUR = 6;
const LAST_START_HOUR = 22;

export function sessionStartTimes(): string[] {
  const times: string[] = [];
  for (let hour = FIRST_START_HOUR; hour <= LAST_START_HOUR; hour++) {
    for (const minute of [0, 15, 30, 45]) {
      if (hour === LAST_START_HOUR && minute > 0) break;
      times.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    }
  }
  return times;
}

// The form sends the day and the time separately; the session starts at both.
export function startFromDayAndTime(day: string, time: string): string {
  return day && time ? `${day}T${time}` : '';
}

export function planNewSession(request: {
  groupId: string;
  startsAt: string;
  note: string;
  price: string;
  groups: SessionGroup[];
  createdBy: string;
}): SessionCreation {
  const group = request.groups.find((candidate) => candidate.id === request.groupId);
  if (!group) return { problem: 'Choose the squad this session is for.' };
  if (!group.isActive) {
    return { problem: `${group.name} is retired. Bring it back before running sessions for it.` };
  }

  const startsAt = parseClubDateTime(request.startsAt);
  if (!startsAt) return { problem: 'Give the date and time the session starts.' };

  // The form arrives filled in with the usual price, and blank still means it.
  // The session keeps its own copy from here on, so editing the constant never
  // rewrites a session that has already run.
  const pricePence = resolvePrice(request.price, DEFAULT_SESSION_PRICE_PENCE);
  if (pricePence === undefined) return { problem: priceProblem() };

  return {
    insert: {
      group_id: group.id,
      starts_at: startsAt,
      note: request.note.trim() || null,
      price_pence: pricePence,
      created_by: request.createdBy,
    },
  };
}

export function planSessionEdit(request: {
  session: PricedSession;
  note: string;
  price: string;
  // Sign-ins already recorded against the session. Each one put a debit in
  // the ledger at the price below, and the ledger cannot be edited.
  attendanceCount: number;
}): SessionChange {
  const pricePence = resolvePrice(request.price, request.session.pricePence);
  if (pricePence === undefined) return { problem: priceProblem() };

  if (pricePence !== request.session.pricePence && request.attendanceCount > 0) {
    return { problem: priceIsSettledMessage(request.session.pricePence, request.attendanceCount) };
  }

  const note = request.note.trim() || null;
  if (note === request.session.note && pricePence === request.session.pricePence) {
    return { problem: 'Nothing was changed.' };
  }

  return { update: { note, price_pence: pricePence } };
}

// Cancelling is a soft-disable: the attendance and the ledger rows behind it
// have to keep meaning something.
export function planCancellation(session: PricedSession): SessionChange {
  if (session.isCancelled) return { problem: 'That session is already cancelled.' };
  return { update: { is_cancelled: true } };
}

export function planReinstatement(session: PricedSession): SessionChange {
  if (!session.isCancelled) return { problem: 'That session is not cancelled.' };
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

// A free session is a price of nothing, allowed since migration 0012:
// sign_in_member then records attendance and no charge, so there is no £0 row
// for the ledger to refuse. parsePounds refuses zero, because every other
// amount it reads (cash, an adjustment, a transfer) must be more than nothing,
// so a typed zero is recognised here first.
const FREE = /^£?0+(\.0{0,2})?$/;

function resolvePrice(input: string, fallbackPence: number): number | undefined {
  const typed = input.replace(/\s/g, '');
  if (!typed) return fallbackPence;
  if (FREE.test(typed)) return 0;
  return parsePounds(typed);
}

function priceProblem(): string {
  return `Enter the price in pounds, such as ${formatPounds(DEFAULT_SESSION_PRICE_PENCE)}, or 0 for a free session.`;
}

function priceIsSettledMessage(pricePence: number, attendanceCount: number): string {
  const runners = attendanceCount === 1 ? 'one runner has' : `${attendanceCount} runners have`;
  return `${runners} already signed in at ${formatPounds(pricePence)}. The ledger records what they were charged, so the price stays as it is — cancel this session and create another if it was wrong.`;
}

// Which past sessions /admin/sessions lists: twelve weeks at a time.
//
// The page used to list every session the club had ever run, and so read
// every attendance and ledger row ever written to put figures beside them,
// about 44 sequential requests after three seasons on the page the committee
// checks the money on. A window keeps the work the same size however old the
// club's history gets.
//
// Windows start and end on UTC midnights, so paging back with `earlierUntil`
// continues exactly where the last window began. If the recent window started
// at "now minus twelve weeks" at 14:30 while the next ended at midnight, a
// session between the two would appear in neither.

const WINDOW_DAYS = 84;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PastWindow {
  /** Inclusive. Always a UTC midnight. */
  from: Date;
  /** Exclusive. `now` for the recent window, otherwise a UTC midnight. */
  to: Date;
  /** The `?until=` that shows the twelve weeks before this window. */
  earlierUntil: string;
  /** True when this is the most recent window rather than an earlier one. */
  isRecent: boolean;
}

export function pastWindow(request: { until: string | null; now?: Date }): PastWindow {
  const now = request.now ?? new Date();
  const asked = midnightOf(request.until);
  const isRecent = !asked || asked.getTime() > now.getTime();

  const to = isRecent ? now : asked;
  const from = new Date(utcMidnight(to).getTime() - WINDOW_DAYS * DAY_MS);

  return { from, to, earlierUntil: from.toISOString().slice(0, 10), isRecent };
}

function midnightOf(value: string | null): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return date.toISOString().slice(0, 10) === value ? date : undefined;
}

function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Sessions grouped by the Omagh day they started on, keeping the order they
 * came in. A day is how the committee asks about a night ("how did Monday
 * go?"), so the Sessions list reads as days, with a total for any day that ran
 * more than one session.
 */
export function byClubDay<T extends { startsAt: string }>(sessions: T[]): { day: string; sessions: T[] }[] {
  const days: { day: string; sessions: T[] }[] = [];
  for (const session of sessions) {
    const day = clubDayKey(session.startsAt);
    const last = days[days.length - 1];
    if (last?.day === day) last.sessions.push(session);
    else days.push({ day, sessions: [session] });
  }
  return days;
}
