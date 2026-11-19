import { describe, expect, it } from 'vitest';
import {
  clubDayWindow,
  theOnlyChoice,
  tonightsSessions,
  type SelectableSession,
} from './tonight';

function session(overrides: Partial<SelectableSession> = {}): SelectableSession {
  return {
    id: 'session-1',
    name: 'Monday Track',
    startsAt: '2026-07-06T18:30:00.000Z',
    location: 'Omagh Leisure Complex',
    pricePence: 200,
    isCancelled: false,
    groupId: 'group-1',
    groupName: 'Endurance',
    ...overrides,
  };
}

const mondayEvening = new Date('2026-07-06T17:00:00.000Z');

describe('tonightsSessions', () => {
  it('offers a session starting this evening', () => {
    const tonight = tonightsSessions([session()], mondayEvening);

    expect(tonight.available.map((s) => s.id)).toEqual(['session-1']);
    expect(tonight.cancelled).toEqual([]);
  });

  it('leaves out a session on another night', () => {
    const tonight = tonightsSessions(
      [session({ id: 'tomorrow', startsAt: '2026-07-07T18:30:00.000Z' })],
      mondayEvening,
    );

    expect(tonight.available).toEqual([]);
  });

  it('keeps a late finish on the night it belongs to, not the UTC day after', () => {
    const lateFinish = session({ id: 'late', startsAt: '2026-07-06T22:45:00.000Z' });

    expect(tonightsSessions([lateFinish], mondayEvening).available.map((s) => s.id)).toEqual([
      'late',
    ]);
  });

  it('is still right once Omagh has rolled over but UTC has not', () => {
    const justAfterMidnight = new Date('2026-07-06T23:30:00.000Z');
    const theSeventh = session({ id: 'seventh', startsAt: '2026-07-07T18:30:00.000Z' });

    expect(tonightsSessions([theSeventh], justAfterMidnight).available.map((s) => s.id)).toEqual([
      'seventh',
    ]);
  });

  it('orders the evening soonest first', () => {
    const later = session({ id: 'later', startsAt: '2026-07-06T19:30:00.000Z' });
    const earlier = session({ id: 'earlier', startsAt: '2026-07-06T17:30:00.000Z' });

    expect(tonightsSessions([later, earlier], mondayEvening).available.map((s) => s.id)).toEqual([
      'earlier',
      'later',
    ]);
  });

  it('names a cancelled session rather than hiding it', () => {
    const calledOff = session({ id: 'off', isCancelled: true });
    const tonight = tonightsSessions([calledOff], mondayEvening);

    expect(tonight.available).toEqual([]);
    expect(tonight.cancelled.map((s) => s.id)).toEqual(['off']);
  });

  it('offers what is left when one of two is called off', () => {
    const calledOff = session({ id: 'off', isCancelled: true });
    const running = session({ id: 'running', startsAt: '2026-07-06T19:30:00.000Z' });
    const tonight = tonightsSessions([calledOff, running], mondayEvening);

    expect(tonight.available.map((s) => s.id)).toEqual(['running']);
    expect(tonight.cancelled.map((s) => s.id)).toEqual(['off']);
  });

  it('says nothing is on when nothing is', () => {
    expect(tonightsSessions([], mondayEvening)).toEqual({ available: [], cancelled: [] });
  });
});

describe('theOnlyChoice', () => {
  it('opens the session straight away when there is just the one', () => {
    const tonight = tonightsSessions([session()], mondayEvening);

    expect(theOnlyChoice(tonight)?.id).toBe('session-1');
  });

  it('makes the registrar choose between two, rather than guessing', () => {
    const second = session({ id: 'second', startsAt: '2026-07-06T19:30:00.000Z' });
    const tonight = tonightsSessions([session(), second], mondayEvening);

    expect(theOnlyChoice(tonight)).toBeUndefined();
  });

  it('has nothing to open when the only session was called off', () => {
    const tonight = tonightsSessions([session({ isCancelled: true })], mondayEvening);

    expect(theOnlyChoice(tonight)).toBeUndefined();
  });
});

describe('clubDayWindow', () => {
  it('bounds a summer evening by Omagh midnight, which is 23:00Z', () => {
    expect(clubDayWindow(mondayEvening)).toEqual({
      from: '2026-07-05T23:00:00.000Z',
      until: '2026-07-06T23:00:00.000Z',
    });
  });

  it('bounds a winter evening by midnight UTC, there being no offset', () => {
    expect(clubDayWindow(new Date('2026-01-12T19:00:00.000Z'))).toEqual({
      from: '2026-01-12T00:00:00.000Z',
      until: '2026-01-13T00:00:00.000Z',
    });
  });

  it('rolls into the next month without landing on the 32nd', () => {
    expect(clubDayWindow(new Date('2026-07-31T19:00:00.000Z'))).toEqual({
      from: '2026-07-30T23:00:00.000Z',
      until: '2026-07-31T23:00:00.000Z',
    });
  });

  it('rolls into the next year', () => {
    expect(clubDayWindow(new Date('2026-12-31T19:00:00.000Z'))).toEqual({
      from: '2026-12-31T00:00:00.000Z',
      until: '2027-01-01T00:00:00.000Z',
    });
  });

  it('spans 23 hours on the spring night the clocks go forward', () => {
    const window = clubDayWindow(new Date('2027-03-28T12:00:00.000Z'));
    const hours = (Date.parse(window.until) - Date.parse(window.from)) / 3_600_000;

    expect(hours).toBe(23);
  });

  it('spans 25 hours on the autumn night they go back', () => {
    const window = clubDayWindow(new Date('2026-10-25T12:00:00.000Z'));
    const hours = (Date.parse(window.until) - Date.parse(window.from)) / 3_600_000;

    expect(hours).toBe(25);
  });

  it('contains every session the same day returns', () => {
    const window = clubDayWindow(mondayEvening);
    const lateFinish = session({ startsAt: '2026-07-06T22:45:00.000Z' });

    expect(Date.parse(lateFinish.startsAt)).toBeGreaterThanOrEqual(Date.parse(window.from));
    expect(Date.parse(lateFinish.startsAt)).toBeLessThan(Date.parse(window.until));
  });
});
