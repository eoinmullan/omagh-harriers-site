import { describe, expect, it } from 'vitest';
import { trainingSchedule } from '../../data/training-schedule';
import {
  dayAfter,
  dayBefore,
  findScheduleProblems,
  formatDate,
  monthAndYear,
  resolveToday,
  selectTraining,
  todayInOmagh,
  type JuniorSession,
  type SeniorSession,
  type TrainingPeriod,
} from './schedule';

const seniorSession = (overrides: Partial<SeniorSession> = {}): SeniorSession => ({
  when: 'Tuesday, 6:30pm',
  where: 'Omagh Leisure Complex',
  ...overrides,
});

const juniorSession = (overrides: Partial<JuniorSession> = {}): JuniorSession => ({
  group: 'Main Group',
  when: 'Monday, 6:00pm',
  where: 'OLC Track',
  ...overrides,
});

const period = (overrides: Partial<TrainingPeriod> = {}): TrainingPeriod => ({
  start: '2026-04-01',
  end: '2026-06-30',
  senior: { sessions: [seniorSession()] },
  junior: { sessions: [juniorSession()] },
  ...overrides,
});

describe('selectTraining', () => {
  it('selects the period covering today', () => {
    const spring = period({ start: '2026-04-01', end: '2026-06-30' });
    const summer = period({ start: '2026-07-01', end: '2026-09-30' });

    expect(selectTraining([spring, summer], '2026-08-15')).toEqual({
      status: 'current',
      period: summer,
    });
  });

  it('selects a period on its first and last day', () => {
    const only = period({ start: '2026-04-01', end: '2026-06-30' });

    expect(selectTraining([only], '2026-04-01')).toMatchObject({ status: 'current' });
    expect(selectTraining([only], '2026-06-30')).toMatchObject({ status: 'current' });
  });

  it('falls back to the most recent past period in a gap between periods', () => {
    const spring = period({ start: '2026-04-01', end: '2026-06-30' });
    const autumn = period({ start: '2026-09-01', end: '2026-11-30' });

    expect(selectTraining([spring, autumn], '2026-07-15')).toEqual({
      status: 'stale',
      period: spring,
    });
  });

  it('falls back to the most recent past period once every period has ended', () => {
    const spring = period({ start: '2026-04-01', end: '2026-06-30' });
    const autumn = period({ start: '2026-09-01', end: '2026-11-30' });

    expect(selectTraining([spring, autumn], '2027-01-15')).toEqual({
      status: 'stale',
      period: autumn,
    });
  });

  it('reports none when today precedes the first period', () => {
    expect(selectTraining([period({ start: '2026-04-01' })], '2026-01-01')).toEqual({
      status: 'none',
    });
  });

  it('reports none for an empty schedule', () => {
    expect(selectTraining([], '2026-08-15')).toEqual({ status: 'none' });
  });
});

describe('findScheduleProblems', () => {
  it('reports nothing for a well-formed schedule', () => {
    const schedule = [
      period({ start: '2026-04-01', end: '2026-06-30' }),
      period({ start: '2026-07-01', end: '2026-09-30' }),
    ];

    expect(findScheduleProblems(schedule)).toEqual([]);
  });

  it('reports a date that does not exist in the calendar', () => {
    const problems = findScheduleProblems([period({ end: '2026-09-31' })]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/not a real date/);
  });

  it('reports an end date that falls before its start date', () => {
    const problems = findScheduleProblems([period({ start: '2026-06-30', end: '2026-04-01' })]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/before it starts/);
  });

  it('reports overlapping periods', () => {
    const problems = findScheduleProblems([
      period({ start: '2026-04-01', end: '2026-07-15' }),
      period({ start: '2026-07-01', end: '2026-09-30' }),
    ]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/overlaps or precedes/);
  });

  it('reports periods that are not in ascending order', () => {
    const problems = findScheduleProblems([
      period({ start: '2026-07-01', end: '2026-09-30' }),
      period({ start: '2026-04-01', end: '2026-06-30' }),
    ]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/overlaps or precedes/);
  });

  it('allows a gap between periods', () => {
    const schedule = [
      period({ start: '2026-04-01', end: '2026-06-30' }),
      period({ start: '2026-09-01', end: '2026-11-30' }),
    ];

    expect(findScheduleProblems(schedule)).toEqual([]);
  });

  it('reports a group with no sessions and no notice', () => {
    const problems = findScheduleProblems([period({ junior: { sessions: [] } })]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/junior has no sessions/);
  });

  it('allows a group with no sessions when it carries a notice', () => {
    const schedule = [
      period({ junior: { notice: 'Taking a break for July — back in August.', sessions: [] } }),
    ];

    expect(findScheduleProblems(schedule)).toEqual([]);
  });
});

describe('todayInOmagh', () => {
  it('uses local time during British Summer Time, not UTC', () => {
    expect(todayInOmagh(new Date('2026-07-30T23:30:00Z'))).toBe('2026-07-31');
  });

  it('uses local time in winter, when Omagh matches UTC', () => {
    expect(todayInOmagh(new Date('2026-12-31T23:30:00Z'))).toBe('2026-12-31');
  });
});

describe('dayBefore and dayAfter', () => {
  it('steps within a month', () => {
    expect(dayBefore('2026-08-15')).toBe('2026-08-14');
    expect(dayAfter('2026-08-15')).toBe('2026-08-16');
  });

  it('steps across a month boundary', () => {
    expect(dayBefore('2026-09-01')).toBe('2026-08-31');
    expect(dayAfter('2026-08-31')).toBe('2026-09-01');
  });

  it('steps across a year boundary', () => {
    expect(dayBefore('2027-01-01')).toBe('2026-12-31');
    expect(dayAfter('2026-12-31')).toBe('2027-01-01');
  });

  it('steps across a leap day', () => {
    expect(dayAfter('2028-02-28')).toBe('2028-02-29');
    expect(dayBefore('2028-03-01')).toBe('2028-02-29');
  });
});

describe('formatDate', () => {
  it('writes a date the way a person would read it', () => {
    expect(formatDate('2026-07-01')).toBe('1 July 2026');
  });

  it('does not slip to the previous day at the end of a month', () => {
    expect(formatDate('2026-12-31')).toBe('31 December 2026');
  });
});

describe('monthAndYear', () => {
  it('names the month and year of a date', () => {
    expect(monthAndYear('2026-12-31')).toBe('December 2026');
  });

  it('does not slip into the previous month at the start of a month', () => {
    expect(monthAndYear('2026-08-01')).toBe('August 2026');
  });
});

describe('resolveToday', () => {
  it('uses the date override in dev', () => {
    const url = new URL('http://localhost:4321/?date=2027-01-15');

    expect(resolveToday(url, true)).toBe('2027-01-15');
  });

  it('ignores the date override outside dev', () => {
    const url = new URL('https://omaghharriers.com/?date=2027-01-15');

    expect(resolveToday(url, false)).toBe(todayInOmagh());
  });

  it('ignores a malformed date override', () => {
    const url = new URL('http://localhost:4321/?date=next-tuesday');

    expect(resolveToday(url, true)).toBe(todayInOmagh());
  });
});

describe('trainingSchedule', () => {
  it('satisfies every schedule invariant', () => {
    expect(findScheduleProblems(trainingSchedule)).toEqual([]);
  });
});
