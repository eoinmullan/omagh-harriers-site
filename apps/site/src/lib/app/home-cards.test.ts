import { describe, expect, it } from 'vitest';
import { adminLine, registrationLine } from './home-cards';

const evening = new Date('2026-11-27T12:00:00Z');

describe('registrationLine', () => {
  it('names one session and its time', () => {
    const line = registrationLine([{ groupName: 'Endurance', startsAt: '2026-11-27T18:45:00Z', isCancelled: false }], evening);

    expect(line).toBe('Today: Endurance at 18:45.');
  });

  it('names two sessions, earliest first', () => {
    const line = registrationLine(
      [
        { groupName: 'Endurance', startsAt: '2026-11-27T18:45:00Z', isCancelled: false },
        { groupName: 'Juniors', startsAt: '2026-11-27T18:00:00Z', isCancelled: false },
      ],
      evening,
    );

    expect(line).toBe('Today: Juniors at 18:00 and Endurance at 18:45.');
  });

  it('counts three or more and says when the first starts', () => {
    const line = registrationLine(
      [
        { groupName: 'Endurance', startsAt: '2026-11-27T18:45:00Z', isCancelled: false },
        { groupName: 'Juniors', startsAt: '2026-11-27T18:00:00Z', isCancelled: false },
        { groupName: 'Sprints', startsAt: '2026-11-27T19:00:00Z', isCancelled: false },
      ],
      evening,
    );

    expect(line).toBe('Today: 3 sessions, from 18:00.');
  });

  it('leaves out a cancelled session and one on another day', () => {
    const line = registrationLine(
      [
        { groupName: 'Endurance', startsAt: '2026-11-27T18:45:00Z', isCancelled: true },
        { groupName: 'Juniors', startsAt: '2026-11-28T18:00:00Z', isCancelled: false },
      ],
      evening,
    );

    expect(line).toBe('Nothing on today. Start a session at the track.');
  });

  it("reads the time on Omagh's clock in summer", () => {
    const line = registrationLine(
      [{ groupName: 'Endurance', startsAt: '2026-07-01T17:45:00Z', isCancelled: false }],
      new Date('2026-07-01T12:00:00Z'),
    );

    expect(line).toBe('Today: Endurance at 18:45.');
  });
});

describe('adminLine', () => {
  it('says when nobody is overdrawn', () => {
    expect(adminLine(0)).toBe('No household is overdrawn.');
  });

  it('says one household in the singular', () => {
    expect(adminLine(1)).toBe('1 household is overdrawn.');
  });

  it('counts several', () => {
    expect(adminLine(7)).toBe('7 households are overdrawn.');
  });
});
