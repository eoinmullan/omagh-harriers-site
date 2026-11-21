import { describe, expect, it } from 'vitest';
import { headsIn, weeklyAttendance, type ReportedSession } from './attendance';

function session(overrides: Partial<ReportedSession> = {}): ReportedSession {
  return {
    startsAt: '2026-11-17T18:00:00Z',
    squad: 'Endurance',
    isCancelled: false,
    heads: { members: 10, guests: 1, total: 11 },
    ...overrides,
  };
}

describe('weeklyAttendance', () => {
  it('adds up each squad within its week', () => {
    const { weeks } = weeklyAttendance([session(), session({ startsAt: '2026-11-19T18:00:00Z' })]);

    expect(weeks).toHaveLength(1);
    expect(weeks[0].bySquad.get('Endurance')).toEqual({ sessions: 2, members: 20, guests: 2 });
  });

  it('starts a week on Monday, on Omagh clocks', () => {
    const sundayNight = session({ startsAt: '2026-11-22T21:00:00Z' });
    const mondayMorning = session({ startsAt: '2026-11-23T07:00:00Z' });

    const { weeks } = weeklyAttendance([sundayNight, mondayMorning]);

    expect(weeks.map((week) => week.weekStarting)).toEqual(['2026-11-23', '2026-11-16']);
  });

  it('lists the newest week first and the squads alphabetically', () => {
    const report = weeklyAttendance([
      session({ squad: 'Sprints', startsAt: '2026-11-03T18:00:00Z' }),
      session({ squad: 'Endurance', startsAt: '2026-11-17T18:00:00Z' }),
    ]);

    expect(report.weeks.map((week) => week.weekStarting)).toEqual(['2026-11-16', '2026-11-02']);
    expect(report.squads).toEqual(['Endurance', 'Sprints']);
  });

  it('leaves out a session that was called off', () => {
    const report = weeklyAttendance([session({ isCancelled: true })]);

    expect(report).toEqual({ squads: [], weeks: [], total: { sessions: 0, members: 0, guests: 0 } });
  });

  it('totals the whole range', () => {
    const report = weeklyAttendance([session(), session({ squad: 'Sprints', heads: { members: 4, guests: 0, total: 4 } })]);

    expect(report.total).toEqual({ sessions: 2, members: 14, guests: 1 });
    expect(headsIn(report.total)).toBe(15);
  });
});
