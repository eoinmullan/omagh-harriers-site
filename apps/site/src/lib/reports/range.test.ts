import { describe, expect, it } from 'vitest';
import { reportRange, singleDay, startOfMonth, weekStarting } from './range';

const midNovember = new Date('2026-11-21T10:00:00Z');

describe('reportRange', () => {
  it('ends today and reaches back the default number of days', () => {
    const request = reportRange({ from: null, to: null, defaultDays: 7, now: midNovember });

    expect(request).toMatchObject({ range: { fromDay: '2026-11-15', toDay: '2026-11-21' } });
  });

  it('covers whole Omagh days, so a summer evening is not cut off at UTC midnight', () => {
    const request = reportRange({ from: '2026-07-06', to: '2026-07-06', defaultDays: 1 });

    expect(request).toMatchObject({
      range: { fromInstant: '2026-07-05T23:00:00.000Z', untilInstant: '2026-07-06T23:00:00.000Z' },
    });
  });

  it('refuses a date that does not exist', () => {
    expect(reportRange({ from: '2026-02-30', to: '2026-03-01', defaultDays: 1 })).toEqual({
      problem: 'Pick a real date for both ends of the range.',
    });
  });

  it('refuses a range that ends before it starts', () => {
    expect(reportRange({ from: '2026-11-10', to: '2026-11-01', defaultDays: 1 })).toEqual({
      problem: 'The first day has to come before the last.',
    });
  });
});

describe('singleDay', () => {
  it('is today on Omagh clocks when no day is asked for', () => {
    const lateNight = new Date('2026-07-06T23:30:00Z');

    expect(singleDay({ day: null, now: lateNight })).toMatchObject({ range: { fromDay: '2026-07-07' } });
  });
});

describe('weekStarting', () => {
  it('is the Monday of the week, Sunday included', () => {
    expect(weekStarting('2026-11-22')).toBe('2026-11-16');
    expect(weekStarting('2026-11-16')).toBe('2026-11-16');
  });
});

describe('startOfMonth', () => {
  it('is the first of the month', () => {
    expect(startOfMonth('2026-11-21')).toBe('2026-11-01');
  });
});
