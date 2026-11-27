import { describe, expect, it } from 'vitest';
import { byMonth, householdHistory, linesFor, membersWithLines, type FreeSession, type LedgerLine } from './history';

const charge: LedgerLine = {
  id: 'charge',
  entry: { type: 'session', amountPence: -200, memberName: 'Jack Kelly', sessionSquad: 'Middle Distance', sessionStartsAt: '2026-11-17T18:00:00Z' },
  createdAt: '2026-11-17T18:05:00Z',
  memberId: 'jack',
};
const topUp: LedgerLine = {
  id: 'cash',
  entry: { type: 'top_up_cash', amountPence: 1000 },
  createdAt: '2026-11-10T18:05:00Z',
  memberId: null,
};
const free: FreeSession = {
  attendanceId: 'free',
  memberId: 'noah',
  memberName: 'Noah Kelly',
  squad: 'Sprints',
  startsAt: '2026-11-14T10:00:00Z',
};

describe('householdHistory', () => {
  it('puts payments, charges and free sessions in one list, newest first', () => {
    const lines = householdHistory({ ledger: [topUp, charge], freeSessions: [free] });

    expect(lines.map((line) => line.id)).toEqual(['charge', 'free', 'cash']);
  });

  it('names the squad on a session line', () => {
    const [line] = householdHistory({ ledger: [charge], freeSessions: [] });

    expect(line.description).toBe('£2.00 deducted — Middle Distance session for Jack Kelly on Tue 17 Nov');
    expect(line.kind).toBe('debit');
  });

  it('keeps a session that cost nothing, which the ledger never records', () => {
    const [line] = householdHistory({ ledger: [], freeSessions: [free] });

    expect(line.description).toBe('No charge — Sprints session for Noah Kelly on Sat 14 Nov');
    expect(line.kind).toBe('free');
  });
});

describe('membersWithLines', () => {
  const names = new Map([['jack', 'Jack Kelly'], ['noah', 'Noah Kelly']]);

  it('lists each member who has lines, once, by name', () => {
    const lines = householdHistory({ ledger: [charge, charge, topUp], freeSessions: [free] });

    expect(membersWithLines(lines, names)).toEqual([
      { memberId: 'jack', name: 'Jack Kelly' },
      { memberId: 'noah', name: 'Noah Kelly' },
    ]);
  });

  it('has one name when only one member trains, which is no choice to offer', () => {
    const lines = householdHistory({ ledger: [charge, topUp], freeSessions: [] });

    expect(membersWithLines(lines, names)).toHaveLength(1);
  });
});

describe('linesFor', () => {
  const lines = householdHistory({ ledger: [charge, topUp], freeSessions: [free] });

  it('keeps everything when nobody is chosen', () => {
    expect(linesFor(lines, null)).toHaveLength(3);
  });

  it("keeps only one member's lines, leaving out the household's own money", () => {
    expect(linesFor(lines, 'jack').map((line) => line.id)).toEqual(['charge']);
  });
});

describe('a statement line as a phone shows it', () => {
  it('carries the amount on its own, signed, and dates a session by its night', () => {
    const [line] = householdHistory({ ledger: [charge], freeSessions: [] });

    expect(line.title).toBe('Middle Distance session');
    expect(line.detail).toBe('Jack Kelly');
    expect(line.amountPence).toBe(-200);
    expect(line.on).toBe('2026-11-17T18:00:00Z');
  });

  it('dates money with no session by when it was recorded', () => {
    const [line] = householdHistory({ ledger: [topUp], freeSessions: [] });

    expect(line.on).toBe('2026-11-10T18:05:00Z');
  });

  it('shows a free session as nothing taken', () => {
    const [line] = householdHistory({ ledger: [], freeSessions: [free] });

    expect(line.amountPence).toBe(0);
    expect(line.detail).toBe('Noah Kelly · no charge');
  });
});

describe('byMonth', () => {
  it('groups lines by the month they were recorded, keeping their order', () => {
    const lines = householdHistory({
      ledger: [charge, topUp, { ...topUp, id: 'october', createdAt: '2026-10-31T23:30:00Z' }],
      freeSessions: [],
    });

    const months = byMonth(lines);

    expect(months.map((month) => month.month)).toEqual(['November 2026', 'October 2026']);
    expect(months[0].lines.map((line) => line.id)).toEqual(['charge', 'cash']);
  });

  it('puts a line in the month it was in Omagh, not in UTC', () => {
    const lateOnTheLastNight = { ...topUp, id: 'late', createdAt: '2026-06-30T23:30:00Z' };

    const [month] = byMonth(householdHistory({ ledger: [lateOnTheLastNight], freeSessions: [] }));

    expect(month.month).toBe('July 2026');
  });
});
