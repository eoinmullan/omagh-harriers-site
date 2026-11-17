import { describe, expect, it } from 'vitest';
import { DEFAULT_SESSION_PRICE_PENCE } from '../credits/ledger';
import {
  partitionByStart,
  planCancellation,
  planNewSession,
  planReinstatement,
  planSessionEdit,
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
    name: 'Monday Track',
    groupId: ENDURANCE.id,
    startsAt: '2027-01-11T19:00',
    location: 'Omagh Leisure Complex',
    price: '',
    groups: [ENDURANCE, RETIRED],
    createdBy: ADMIN,
    ...overrides,
  };
}

function session(overrides: Partial<PricedSession> = {}): PricedSession {
  return {
    name: 'Monday Track',
    location: 'Omagh Leisure Complex',
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
      name: 'Monday Track',
      group_id: 'group-a',
      starts_at: '2027-01-11T19:00:00.000Z',
      location: 'Omagh Leisure Complex',
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

  it('treats a blank location as no location', () => {
    const insert = insertOf(planNewSession(newSessionRequest({ location: '  ' })));
    expect(insert.location).toBeNull();
  });

  it('refuses an empty name', () => {
    expect(problemOf(planNewSession(newSessionRequest({ name: ' ' })))).toBe(
      'Give the session a name.',
    );
  });

  it('refuses a group that does not exist', () => {
    expect(problemOf(planNewSession(newSessionRequest({ groupId: 'nonsense' })))).toBe(
      'Choose the group this session is for.',
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
  it('writes name, location and price together', () => {
    const change = planSessionEdit({
      session: session(),
      name: 'Monday Track Speed',
      location: 'Omagh Leisure Complex',
      price: '2.50',
      attendanceCount: 0,
    });

    expect(updateOf(change)).toEqual({
      name: 'Monday Track Speed',
      location: 'Omagh Leisure Complex',
      price_pence: 250,
    });
  });

  it('keeps the session price when the admin leaves the field alone', () => {
    const change = planSessionEdit({
      session: session({ pricePence: 350 }),
      name: 'Tuesday Hills',
      location: '',
      price: '',
      attendanceCount: 4,
    });

    expect(updateOf(change)).toEqual({
      name: 'Tuesday Hills',
      location: null,
      price_pence: 350,
    });
  });

  it('refuses a new price once somebody has signed in at the old one', () => {
    const change = planSessionEdit({
      session: session(),
      name: 'Monday Track',
      location: 'Omagh Leisure Complex',
      price: '3',
      attendanceCount: 12,
    });

    expect(problemOf(change)).toContain('12 runners have already signed in at £2.00');
  });

  it('counts one runner as one runner', () => {
    const change = planSessionEdit({
      session: session(),
      name: 'Monday Track',
      location: 'Omagh Leisure Complex',
      price: '3',
      attendanceCount: 1,
    });

    expect(problemOf(change)).toContain('one runner has already signed in');
  });

  it('still lets the name be fixed on a session with attendance', () => {
    const change = planSessionEdit({
      session: session(),
      name: 'Monday Track Speed',
      location: 'Omagh Leisure Complex',
      price: '2.00',
      attendanceCount: 12,
    });

    expect(updateOf(change).name).toBe('Monday Track Speed');
  });

  it('says so when nothing would change', () => {
    const change = planSessionEdit({
      session: session(),
      name: 'Monday Track',
      location: 'Omagh Leisure Complex',
      price: '2',
      attendanceCount: 0,
    });

    expect(problemOf(change)).toBe('Nothing was changed.');
  });

  it('refuses an empty name', () => {
    const change = planSessionEdit({
      session: session(),
      name: '',
      location: '',
      price: '',
      attendanceCount: 0,
    });

    expect(problemOf(change)).toBe('Give the session a name.');
  });
});

describe('planCancellation', () => {
  it('soft-disables rather than dropping the row', () => {
    expect(updateOf(planCancellation(session()))).toEqual({ is_cancelled: true });
  });

  it('refuses a session already cancelled', () => {
    expect(problemOf(planCancellation(session({ isCancelled: true })))).toBe(
      'Monday Track is already cancelled.',
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
    expect(problemOf(planReinstatement(session()))).toBe('Monday Track is not cancelled.');
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
