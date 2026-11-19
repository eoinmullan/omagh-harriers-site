import { describe, expect, it } from 'vitest';
import { describeSnapshotAge } from './snapshot';

describe('describeSnapshotAge', () => {
  const evening = new Date('2026-11-19T19:42:00.000Z');

  it('calls a fresh snapshot a moment ago, rather than alarming anybody', () => {
    const savedAt = evening.getTime() - 20_000;

    expect(describeSnapshotAge(savedAt, evening)).toBe(
      'Showing what this phone last saw, a moment ago.',
    );
  });

  it('names the time once it is minutes old, not an age that goes stale while read', () => {
    const savedAt = new Date('2026-11-19T19:30:00.000Z').getTime();

    expect(describeSnapshotAge(savedAt, evening)).toBe(
      'Showing what this phone last saw at 19:30.',
    );
  });

  it("reads the time on Omagh clocks, not the Worker's", () => {
    const summerEvening = new Date('2026-07-06T19:00:00.000Z');
    const savedAt = new Date('2026-07-06T18:30:00.000Z').getTime();

    expect(describeSnapshotAge(savedAt, summerEvening)).toBe(
      'Showing what this phone last saw at 19:30.',
    );
  });

  it('does not go backwards if the clock has been nudged', () => {
    const savedAt = evening.getTime() + 5_000;

    expect(describeSnapshotAge(savedAt, evening)).toBe(
      'Showing what this phone last saw, a moment ago.',
    );
  });

  it('is exactly a minute at the boundary', () => {
    const savedAt = new Date('2026-11-19T19:41:00.000Z').getTime();

    expect(describeSnapshotAge(savedAt, evening)).toBe(
      'Showing what this phone last saw at 19:41.',
    );
  });
});
