export interface SeniorSession {
  when: string;
  where: string;
}

export interface JuniorSession {
  group: string;
  when: string;
  where: string;
}

export interface TrainingGroup<TSession> {
  notice?: string;
  sessions: TSession[];
}

export interface TrainingPeriod {
  start: string;
  end: string;
  senior: TrainingGroup<SeniorSession>;
  junior: TrainingGroup<JuniorSession>;
}

export type TrainingSchedule = TrainingPeriod[];

export type ActiveTraining =
  | { status: 'current'; period: TrainingPeriod }
  | { status: 'stale'; period: TrainingPeriod }
  | { status: 'none' };

/**
 * Dates throughout are `YYYY-MM-DD` strings compared lexicographically, which is correct
 * for ISO dates and immune to timezone and daylight saving bugs.
 */
export function selectTraining(schedule: TrainingSchedule, today: string): ActiveTraining {
  const current = schedule.find((period) => period.start <= today && today <= period.end);
  if (current) return { status: 'current', period: current };

  const mostRecentlyEnded = schedule.filter((period) => period.end < today).at(-1);
  if (mostRecentlyEnded) return { status: 'stale', period: mostRecentlyEnded };

  return { status: 'none' };
}

/**
 * The Worker runs in UTC, so without an explicit time zone a period or season boundary
 * would flip an hour early during British Summer Time.
 */
export function todayInOmagh(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * In dev only, `?date=YYYY-MM-DD` stands in for today so future states of the page can be
 * previewed. Gated the same way as the WIP nav flag, so it has no production surface.
 */
export function resolveToday(url: URL, isDev: boolean): string {
  const override = isDev ? url.searchParams.get('date') : null;
  return override && isValidIsoDate(override) ? override : todayInOmagh();
}

export function dayBefore(isoDate: string): string {
  return shiftDays(isoDate, -1);
}

export function dayAfter(isoDate: string): string {
  return shiftDays(isoDate, 1);
}

export function shiftDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** e.g. '2026-07-01' becomes '1 July 2026'. */
export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** e.g. '2026-12-31' becomes 'December 2026'. */
export function monthAndYear(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * Invariants TypeScript cannot express, checked by the test suite against the real
 * schedule. Gaps between periods are permitted — they deliberately produce the stale
 * state rather than hiding the times.
 */
export function findScheduleProblems(schedule: TrainingSchedule): string[] {
  const problems: string[] = [];

  schedule.forEach((period, index) => {
    if (!isValidIsoDate(period.start)) {
      problems.push(`Period ${index}: "${period.start}" is not a real date`);
    }

    if (!isValidIsoDate(period.end)) {
      problems.push(`Period ${index}: "${period.end}" is not a real date`);
    }

    if (period.end < period.start) {
      problems.push(`Period ${index}: ends ${period.end}, before it starts ${period.start}`);
    }

    const previous = schedule[index - 1];
    if (previous && period.start <= previous.end) {
      problems.push(
        `Period ${index}: starts ${period.start}, which overlaps or precedes the previous period ending ${previous.end}`,
      );
    }

    for (const [name, group] of [
      ['senior', period.senior],
      ['junior', period.junior],
    ] as const) {
      if (group.sessions.length === 0 && !group.notice) {
        problems.push(`Period ${index}: ${name} has no sessions and no notice explaining why`);
      }
    }
  });

  return problems;
}
