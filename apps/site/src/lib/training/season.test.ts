import { describe, expect, it } from 'vitest';
import { seasonLabel, seasonSegments } from './season';

describe('seasonLabel', () => {
  it('labels the first and last day of spring', () => {
    expect(seasonLabel('2026-03-01')).toBe('Spring 2026');
    expect(seasonLabel('2026-05-31')).toBe('Spring 2026');
  });

  it('labels the first and last day of summer', () => {
    expect(seasonLabel('2026-06-01')).toBe('Summer 2026');
    expect(seasonLabel('2026-08-31')).toBe('Summer 2026');
  });

  it('labels the first and last day of autumn', () => {
    expect(seasonLabel('2026-09-01')).toBe('Autumn 2026');
    expect(seasonLabel('2026-11-30')).toBe('Autumn 2026');
  });

  it('gives every winter month the same label across the year boundary', () => {
    expect(seasonLabel('2026-12-01')).toBe('Winter 2026/2027');
    expect(seasonLabel('2026-12-31')).toBe('Winter 2026/2027');
    expect(seasonLabel('2027-01-01')).toBe('Winter 2026/2027');
    expect(seasonLabel('2027-02-28')).toBe('Winter 2026/2027');
  });

  it('labels the day before spring as the previous winter', () => {
    expect(seasonLabel('2026-02-28')).toBe('Winter 2025/2026');
  });

  it('labels a leap day', () => {
    expect(seasonLabel('2028-02-29')).toBe('Winter 2027/2028');
  });
});

describe('seasonSegments', () => {
  it('leaves a range inside a single season whole', () => {
    expect(seasonSegments('2026-07-01', '2026-07-31')).toEqual([
      { start: '2026-07-01', end: '2026-07-31', label: 'Summer 2026' },
    ]);
  });

  it('splits a range that crosses one boundary', () => {
    expect(seasonSegments('2026-08-15', '2026-09-15')).toEqual([
      { start: '2026-08-15', end: '2026-08-31', label: 'Summer 2026' },
      { start: '2026-09-01', end: '2026-09-15', label: 'Autumn 2026' },
    ]);
  });

  it('splits a range that crosses several boundaries', () => {
    expect(seasonSegments('2026-08-01', '2026-12-31')).toEqual([
      { start: '2026-08-01', end: '2026-08-31', label: 'Summer 2026' },
      { start: '2026-09-01', end: '2026-11-30', label: 'Autumn 2026' },
      { start: '2026-12-01', end: '2026-12-31', label: 'Winter 2026/2027' },
    ]);
  });

  it('keeps a winter that spans the year boundary as one segment', () => {
    expect(seasonSegments('2026-11-01', '2027-03-31')).toEqual([
      { start: '2026-11-01', end: '2026-11-30', label: 'Autumn 2026' },
      { start: '2026-12-01', end: '2027-02-28', label: 'Winter 2026/2027' },
      { start: '2027-03-01', end: '2027-03-31', label: 'Spring 2027' },
    ]);
  });

  it('starts cleanly when the range begins on a season boundary', () => {
    expect(seasonSegments('2026-09-01', '2026-11-30')).toEqual([
      { start: '2026-09-01', end: '2026-11-30', label: 'Autumn 2026' },
    ]);
  });

  it('ends cleanly when the range stops the day before a boundary', () => {
    expect(seasonSegments('2026-06-01', '2026-08-31')).toEqual([
      { start: '2026-06-01', end: '2026-08-31', label: 'Summer 2026' },
    ]);
  });

  it('handles a single day', () => {
    expect(seasonSegments('2026-12-01', '2026-12-01')).toEqual([
      { start: '2026-12-01', end: '2026-12-01', label: 'Winter 2026/2027' },
    ]);
  });
});
