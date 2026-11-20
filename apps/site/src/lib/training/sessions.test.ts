import { describe, expect, it } from 'vitest';
import { DEFAULT_SESSION_PRICE_PENCE } from '../credits/ledger';
import {
  partitionByStart,
  pastWindow,
  planCancellation,
  planNewSession,
  planReinstatement,
  planSessionEdit,
  sessionStartTimes,
  startFromDayAndTime,
  DEFAULT_SESSION_START_TIME,
  type PricedSession,
  type SessionChange,
  type SessionCreation,
  type SessionGroup,
} from './sessions';

const ADMIN = 'admin-principal-id';

const ENDURANCE: SessionGroup = { id: 'group-a', name: 'Endurance', isActive: true };
const RETIRED: SessionGroup = { id: 'group-b', name: 'Juniors', isActive: false };

function newSessionRequest(overrides: Partial<Parameters<typeof planNewSession>[0]> = {}) {
  return {
    groupId: ENDURANCE.id,
    startsAt: '2027-01-11T19:00',
    note: '',
    price: '',
    groups: [ENDURANCE, RETIRED],
    createdBy: ADMIN,
    ...overrides,
  };
}

function session(overrides: Partial<PricedSession> = {}): PricedSession {
  return {
    note: null,
    pricePence: DEFAULT_SESSION_PRICE_PENCE,
    isCancelled: false,
    ...overrides,
  };
}

function insertOf(creation: SessionCreation) {
  if ('problem' in creation) throw new Error(`expected an insert, got: ${creation.problem}`);
  return creation.insert;
}

function updateOf(change: SessionChange) {
  if ('problem' in change) throw new Error(`expected an update, got: ${change.problem}`);
  return change.update;
}

function problemOf(result: SessionCreation | SessionChange): string {
  if (!('problem' in result)) throw new Error('expected a problem');
  return result.problem;
}

describe('planNewSession', () => {
  it('takes the price from the constant when the admin leaves it blank', () => {
    expect(insertOf(planNewSession(newSessionRequest()))).toEqual({
      group_id: 'group-a',
      starts_at: '2027-01-11T19:00:00.000Z',
      note: null,
      price_pence: DEFAULT_SESSION_PRICE_PENCE,
      created_by: ADMIN,
    });
  });

  it('keeps a price the admin did type', () => {
    const insert = insertOf(planNewSession(newSessionRequest({ price: '3.50' })));
    expect(insert.price_pence).toBe(350);
  });

  it('reads the start time as the club\'s own clock, not the Worker\'s', () => {
    const insert = insertOf(planNewSession(newSessionRequest({ startsAt: '2027-07-05T19:00' })));
    expect(insert.starts_at).toBe('2027-07-05T18:00:00.000Z');
  });

  it('treats a blank note as no note, because most nights have nothing to say', () => {
    expect(insertOf(planNewSession(newSessionRequest({ note: '  ' }))).note).toBeNull();
  });

  it('keeps a note that says something', () => {
    const insert = insertOf(planNewSession(newSessionRequest({ note: ' Meet at the top car park ' })));
    expect(insert.note).toBe('Meet at the top car park');
  });

  it('asks for nothing but the group and the time', () => {
    expect(problemOf(planNewSession(newSessionRequest({ groupId: '' })))).toBe(
      'Choose the squad this session is for.',
    );
  });

  it('refuses a group that does not exist', () => {
    expect(problemOf(planNewSession(newSessionRequest({ groupId: 'nonsense' })))).toBe(
      'Choose the squad this session is for.',
    );
  });

  it('refuses a retired group', () => {
    expect(problemOf(planNewSession(newSessionRequest({ groupId: RETIRED.id })))).toContain(
      'Juniors is retired',
    );
  });

  it('refuses a start time it cannot read', () => {
    expect(problemOf(planNewSession(newSessionRequest({ startsAt: '' })))).toBe(
      'Give the date and time the session starts.',
    );
  });

  it('refuses a price that is not an amount', () => {
    expect(problemOf(planNewSession(newSessionRequest({ price: 'free' })))).toBe(
      'Enter the price in pounds, or leave it blank for £2.00.',
    );
  });

  it('refuses a price of nothing, which no ledger row could carry', () => {
    expect(problemOf(planNewSession(newSessionRequest({ price: '0' })))).toContain(
      'Enter the price in pounds',
    );
  });
});

describe('planSessionEdit', () => {
  it('writes the note and the price together', () => {
    const change = planSessionEdit({
      session: session(),
      note: 'Juniors only tonight',
      price: '2.50',
      attendanceCount: 0,
    });

    expect(updateOf(change)).toEqual({
      note: 'Juniors only tonight',
      price_pence: 250,
    });
  });

  it('keeps the session price when the admin leaves the field alone', () => {
    const change = planSessionEdit({
      session: session({ pricePence: 350, note: 'Top car park' }),
      note: '',
      price: '',
      attendanceCount: 4,
    });

    expect(updateOf(change)).toEqual({
      note: null,
      price_pence: 350,
    });
  });

  it('refuses a new price once somebody has signed in at the old one', () => {
    const change = planSessionEdit({
      session: session(),
      note: '',
      price: '3',
      attendanceCount: 12,
    });

    expect(problemOf(change)).toContain('12 runners have already signed in at £2.00');
  });

  it('counts one runner as one runner', () => {
    const change = planSessionEdit({
      session: session(),
      note: '',
      price: '3',
      attendanceCount: 1,
    });

    expect(problemOf(change)).toContain('one runner has already signed in');
  });

  it('still lets the note be written on a session with attendance', () => {
    const change = planSessionEdit({
      session: session(),
      note: 'Finished early, floodlight out',
      price: '2.00',
      attendanceCount: 12,
    });

    expect(updateOf(change).note).toBe('Finished early, floodlight out');
  });

  it('says so when nothing would change', () => {
    const change = planSessionEdit({
      session: session(),
      note: '',
      price: '2',
      attendanceCount: 0,
    });

    expect(problemOf(change)).toBe('Nothing was changed.');
  });

});

describe('planCancellation', () => {
  it('soft-disables rather than dropping the row', () => {
    expect(updateOf(planCancellation(session()))).toEqual({ is_cancelled: true });
  });

  it('refuses a session already cancelled', () => {
    expect(problemOf(planCancellation(session({ isCancelled: true })))).toBe(
      'That session is already cancelled.',
    );
  });
});

describe('planReinstatement', () => {
  it('puts a cancelled session back on', () => {
    expect(updateOf(planReinstatement(session({ isCancelled: true })))).toEqual({
      is_cancelled: false,
    });
  });

  it('refuses a session that was never cancelled', () => {
    expect(problemOf(planReinstatement(session()))).toBe('That session is not cancelled.');
  });
});

describe('partitionByStart', () => {
  const now = new Date('2027-01-11T20:00:00.000Z');

  const sessions = [
    { id: 'last-week', startsAt: '2027-01-04T19:00:00.000Z' },
    { id: 'next-week', startsAt: '2027-01-18T19:00:00.000Z' },
    { id: 'tonight', startsAt: '2027-01-11T19:00:00.000Z' },
    { id: 'tomorrow', startsAt: '2027-01-12T19:00:00.000Z' },
  ];

  it('puts the next session first', () => {
    expect(partitionByStart(sessions, now).upcoming.map((s) => s.id)).toEqual([
      'tomorrow',
      'next-week',
    ]);
  });

  it('puts the most recent night first', () => {
    expect(partitionByStart(sessions, now).past.map((s) => s.id)).toEqual([
      'tonight',
      'last-week',
    ]);
  });

  it('counts a session starting right now as upcoming', () => {
    const partition = partitionByStart(sessions, new Date('2027-01-11T19:00:00.000Z'));
    expect(partition.upcoming.map((s) => s.id)).toEqual(['tonight', 'tomorrow', 'next-week']);
  });

  it('copes with nothing scheduled at all', () => {
    expect(partitionByStart([], now)).toEqual({ upcoming: [], past: [] });
  });
});

describe('pastWindow', () => {
  const now = new Date('2026-11-20T14:30:00Z');

  it('shows the most recent twelve weeks when no date is asked for', () => {
    const window = pastWindow({ until: null, now });

    expect(window.isRecent).toBe(true);
    expect(window.to.toISOString()).toBe('2026-11-20T14:30:00.000Z');
    expect(window.from.toISOString()).toBe('2026-08-28T00:00:00.000Z');
    expect(window.earlierUntil).toBe('2026-08-28');
  });

  it('shows the twelve weeks before a date when one is asked for', () => {
    const window = pastWindow({ until: '2026-08-28', now });

    expect(window.isRecent).toBe(false);
    expect(window.to.toISOString()).toBe('2026-08-28T00:00:00.000Z');
    expect(window.from.toISOString()).toBe('2026-06-05T00:00:00.000Z');
    expect(window.earlierUntil).toBe('2026-06-05');
  });

  it('pages back with no gap and no overlap, so no session falls between two windows', () => {
    const recent = pastWindow({ until: null, now });
    const before = pastWindow({ until: recent.earlierUntil, now });
    const beforeThat = pastWindow({ until: before.earlierUntil, now });

    expect(before.to.getTime()).toBe(recent.from.getTime());
    expect(beforeThat.to.getTime()).toBe(before.from.getTime());
  });

  it('treats a date that is not a date as asking for the most recent weeks', () => {
    expect(pastWindow({ until: 'yesterday', now }).isRecent).toBe(true);
    expect(pastWindow({ until: '2026-02-30', now }).isRecent).toBe(true);
  });

  it('treats a date in the future as asking for the most recent weeks', () => {
    expect(pastWindow({ until: '2027-01-01', now }).isRecent).toBe(true);
  });
});

describe('sessionStartTimes', () => {
  it('offers every quarter hour from six in the morning to ten at night', () => {
    const times = sessionStartTimes();

    expect(times[0]).toBe('06:00');
    expect(times.at(-1)).toBe('22:00');
    expect(times).toContain('18:30');
    expect(times).toHaveLength(65);
  });

  it('includes the default start', () => {
    expect(sessionStartTimes()).toContain(DEFAULT_SESSION_START_TIME);
  });
});

describe('startFromDayAndTime', () => {
  it('joins a day and a time into the start the plan reads', () => {
    expect(startFromDayAndTime('2026-11-23', '18:00')).toBe('2026-11-23T18:00');
  });

  it('gives nothing to read when either half is missing', () => {
    expect(startFromDayAndTime('', '18:00')).toBe('');
    expect(startFromDayAndTime('2026-11-23', '')).toBe('');
  });

  it('is a start the plan accepts', () => {
    const plan = planNewSession({
      groupId: ENDURANCE.id,
      startsAt: startFromDayAndTime('2026-11-23', '18:00'),
      note: '',
      price: '',
      groups: [ENDURANCE],
      createdBy: ADMIN,
    });

    expect(plan).toMatchObject({ insert: { starts_at: '2026-11-23T18:00:00.000Z' } });
  });
});
