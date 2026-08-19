import { selectTraining, shiftDays, type TrainingSchedule } from './schedule';

export type CalendarAudience = 'combined' | 'junior';

export interface RaceEntry {
  date: string;
  name: string;
  audience: 'senior' | 'junior' | 'both';
}

export type RaceSchedule = RaceEntry[];

export interface CalendarEntry {
  category: 'senior' | 'junior' | 'race';
  text: string;
}

export interface CalendarDay {
  date: string;
  dayNumber: number;
  inMonth: boolean;
  entries: CalendarEntry[];
}

export interface MonthCalendar {
  label: string;
  weeks: CalendarDay[][];
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function startOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function addMonths(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

/** e.g. '2026-08-01' becomes 'August 2026'. */
export function monthLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
}

/** e.g. '2026-09-13' becomes 'Sunday, 13 September'. */
export function dayLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function weekdayName(isoDate: string): string {
  return WEEKDAY_NAMES[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
}

/** Monday-first index of the week: Monday = 0 ... Sunday = 6. */
function mondayIndex(isoDate: string): number {
  return (new Date(`${isoDate}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Session `when` strings are day-name-first, e.g. "Tuesday, 6:30pm" or "Sunday mornings". */
function sessionWeekdayName(when: string): string {
  return when.match(/^[A-Za-z]+/)?.[0] ?? '';
}

function sessionTimeLabel(when: string): string {
  const withoutDay = when.replace(/^[A-Za-z]+\W*/, '').trim();
  return withoutDay.length > 0 ? withoutDay : when;
}

function entriesForDate(
  dateIso: string,
  schedule: TrainingSchedule,
  races: RaceSchedule,
  audience: CalendarAudience,
): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  const active = selectTraining(schedule, dateIso);
  const period = active.status === 'current' ? active.period : undefined;
  const dayName = weekdayName(dateIso);

  if (period) {
    if (audience === 'combined') {
      for (const session of period.senior.sessions) {
        if (sessionWeekdayName(session.when) === dayName) {
          entries.push({ category: 'senior', text: `${sessionTimeLabel(session.when)} — ${session.where}` });
        }
      }
    }

    for (const session of period.junior.sessions) {
      if (sessionWeekdayName(session.when) === dayName) {
        entries.push({
          category: 'junior',
          text: `${session.group}, ${sessionTimeLabel(session.when)} — ${session.where}`,
        });
      }
    }
  }

  for (const race of races) {
    if (race.date !== dateIso) continue;
    const visible = audience === 'combined' || race.audience === 'junior' || race.audience === 'both';
    if (visible) entries.push({ category: 'race', text: race.name });
  }

  return entries;
}

export function buildMonthCalendar(
  monthStartIso: string,
  schedule: TrainingSchedule,
  races: RaceSchedule,
  audience: CalendarAudience,
): MonthCalendar {
  const lastDateIso = shiftDays(addMonths(monthStartIso, 1), -1);
  const leadingPadding = mondayIndex(monthStartIso);
  const trailingPadding = 6 - mondayIndex(lastDateIso);

  const gridStart = shiftDays(monthStartIso, -leadingPadding);
  const gridEnd = shiftDays(lastDateIso, trailingPadding);

  const days: CalendarDay[] = [];
  for (let date = gridStart; date <= gridEnd; date = shiftDays(date, 1)) {
    const inMonth = date >= monthStartIso && date <= lastDateIso;
    days.push({
      date,
      dayNumber: Number(date.slice(8, 10)),
      inMonth,
      entries: inMonth ? entriesForDate(date, schedule, races, audience) : [],
    });
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return { label: monthLabel(monthStartIso), weeks };
}
