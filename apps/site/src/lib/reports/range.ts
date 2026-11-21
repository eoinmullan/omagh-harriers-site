import { clubDayKey, parseClubDateTime } from '../training/club-time';

// A report covers whole days on Omagh's calendar, from the first day to the
// last, both included. The reads need instants, so the range also carries the
// start of the first day and the start of the day after the last.

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface ReportRange {
  fromDay: string;
  toDay: string;
  /** The start of `fromDay` in Omagh, inclusive. */
  fromInstant: string;
  /** The start of the day after `toDay` in Omagh, exclusive. */
  untilInstant: string;
}

export type RangeRequest = { range: ReportRange } | { problem: string };

export function reportRange(request: {
  from: string | null;
  to: string | null;
  defaultDays: number;
  now?: Date;
}): RangeRequest {
  const today = clubDayKey(request.now ?? new Date());
  const toDay = request.to || today;
  const fromDay = request.from || addDays(toDay, -(request.defaultDays - 1));

  if (!isRealDay(fromDay) || !isRealDay(toDay)) return { problem: 'Pick a real date for both ends of the range.' };
  if (fromDay > toDay) return { problem: 'The first day has to come before the last.' };

  return {
    range: {
      fromDay,
      toDay,
      fromInstant: startOfClubDay(fromDay),
      untilInstant: startOfClubDay(addDays(toDay, 1)),
    },
  };
}

export function singleDay(request: { day: string | null; now?: Date }): RangeRequest {
  const day = request.day || clubDayKey(request.now ?? new Date());
  return reportRange({ from: day, to: day, defaultDays: 1, now: request.now });
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The Monday that starts the club week holding this day. */
export function weekStarting(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

function startOfClubDay(day: string): string {
  return parseClubDateTime(`${day}T00:00`) ?? '';
}

function isRealDay(day: string): boolean {
  return DAY_PATTERN.test(day) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}
