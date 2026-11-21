import { clubDayKey } from '../training/club-time';
import type { Headcount } from '../training/session-cash';
import { weekStarting } from './range';

// Attendance week by week, squad by squad: how many sessions each squad ran and
// how many people came. One table answers both "how is Endurance doing?" and
// "how busy is the club?", which the plan listed as two reports.
//
// A called-off session ran nobody, so it is left out rather than counted as an
// empty night that would drag the averages down.

export interface ReportedSession {
  startsAt: string;
  squad: string;
  isCancelled: boolean;
  heads: Headcount;
}

export interface SquadWeek {
  sessions: number;
  members: number;
  guests: number;
}

export interface AttendanceWeek {
  /** The Monday, as `YYYY-MM-DD`. */
  weekStarting: string;
  bySquad: Map<string, SquadWeek>;
  total: SquadWeek;
}

export interface WeeklyAttendance {
  squads: string[];
  weeks: AttendanceWeek[];
  total: SquadWeek;
}

export function weeklyAttendance(sessions: ReportedSession[]): WeeklyAttendance {
  const ran = sessions.filter((session) => !session.isCancelled);
  const weeks = new Map<string, AttendanceWeek>();

  for (const session of ran) {
    const key = weekStarting(clubDayKey(session.startsAt));
    const week = weeks.get(key) ?? { weekStarting: key, bySquad: new Map(), total: emptyWeek() };
    const squad = week.bySquad.get(session.squad) ?? emptyWeek();
    addSession(squad, session.heads);
    addSession(week.total, session.heads);
    week.bySquad.set(session.squad, squad);
    weeks.set(key, week);
  }

  const total = emptyWeek();
  for (const session of ran) addSession(total, session.heads);

  return {
    squads: [...new Set(ran.map((session) => session.squad))].sort((a, b) => a.localeCompare(b, 'en-GB')),
    weeks: [...weeks.values()].sort((a, b) => b.weekStarting.localeCompare(a.weekStarting)),
    total,
  };
}

export function headsIn(week: SquadWeek): number {
  return week.members + week.guests;
}

function emptyWeek(): SquadWeek {
  return { sessions: 0, members: 0, guests: 0 };
}

function addSession(week: SquadWeek, heads: Headcount): void {
  week.sessions += 1;
  week.members += heads.members;
  week.guests += heads.guests;
}
