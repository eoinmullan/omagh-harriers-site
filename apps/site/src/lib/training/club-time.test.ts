import { describe, expect, it } from 'vitest';
import {
  clubDayKey,
  formatClubDateTime,
  formatClubNight,
  formatClubTime,
  parseClubDateTime,
  toClubDateTimeInput,
} from './club-time';

describe('parseClubDateTime', () => {
  it('reads a winter evening as UTC, because Omagh is on UTC then', () => {
    expect(parseClubDateTime('2027-01-11T19:00')).toBe('2027-01-11T19:00:00.000Z');
  });

  it('takes the summer hour off, so 19:00 at the track is 18:00 UTC', () => {
    expect(parseClubDateTime('2027-07-05T19:00')).toBe('2027-07-05T18:00:00.000Z');
  });

  it('handles the evening after the clocks go forward', () => {
    expect(parseClubDateTime('2027-03-28T19:00')).toBe('2027-03-28T18:00:00.000Z');
  });

  it('handles the evening after the clocks go back', () => {
    expect(parseClubDateTime('2027-10-31T19:00')).toBe('2027-10-31T19:00:00.000Z');
  });

  it('refuses anything that is not a date and a time', () => {
    expect(parseClubDateTime('')).toBeUndefined();
    expect(parseClubDateTime('2027-07-05')).toBeUndefined();
    expect(parseClubDateTime('tomorrow at seven')).toBeUndefined();
    expect(parseClubDateTime('2027-13-05T19:00')).toBeUndefined();
  });
});

describe('toClubDateTimeInput', () => {
  it('round-trips a summer session back to what was typed', () => {
    expect(toClubDateTimeInput('2027-07-05T18:00:00.000Z')).toBe('2027-07-05T19:00');
  });

  it('round-trips a winter session back to what was typed', () => {
    expect(toClubDateTimeInput('2027-01-11T19:00:00.000Z')).toBe('2027-01-11T19:00');
  });

  it('survives a round trip in either direction', () => {
    const typed = '2027-05-18T20:15';
    expect(toClubDateTimeInput(parseClubDateTime(typed)!)).toBe(typed);
  });
});

describe('formatClubDateTime', () => {
  it('reads as the evening the club turned up, not the UTC one', () => {
    expect(formatClubDateTime('2027-07-05T18:00:00.000Z')).toContain('19:00');
    expect(formatClubDateTime('2027-07-05T18:00:00.000Z')).toContain('Mon');
  });
});

describe('clubDayKey', () => {
  it('reads a summer evening as the day Omagh is living in', () => {
    expect(clubDayKey('2026-07-06T18:30:00.000Z')).toBe('2026-07-06');
  });

  it('keeps a late finish on the night it belongs to', () => {
    expect(clubDayKey('2026-07-06T22:30:00.000Z')).toBe('2026-07-06');
  });

  it('rolls over when Omagh does, not when UTC does', () => {
    expect(clubDayKey('2026-07-06T23:30:00.000Z')).toBe('2026-07-07');
  });

  it('agrees with UTC in winter, when there is no offset to apply', () => {
    expect(clubDayKey('2026-01-12T19:00:00.000Z')).toBe('2026-01-12');
  });

  it('reads midnight as the start of the day, not hour 24 of the last one', () => {
    expect(clubDayKey('2026-01-12T00:00:00.000Z')).toBe('2026-01-12');
  });
});

describe('formatClubTime', () => {
  it('reads a summer evening as the clock on the track reads it', () => {
    expect(formatClubTime('2026-07-06T18:30:00.000Z')).toBe('19:30');
  });

  it('reads a winter evening the same way, with no offset to apply', () => {
    expect(formatClubTime('2026-01-12T19:00:00.000Z')).toBe('19:00');
  });
});

describe('formatClubNight', () => {
  it('names the night by Omagh\'s calendar, not UTC', () => {
    expect(formatClubNight('2026-11-17T23:30:00Z')).toBe('Tue 17 Nov');
    expect(formatClubNight('2026-07-06T23:30:00Z')).toBe('Tue 7 Jul');
  });
});
