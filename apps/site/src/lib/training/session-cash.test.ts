import { describe, expect, it } from 'vitest';
import {
  countHeads,
  summariseSessionCash,
  UNATTRIBUTED,
  type SessionAttendanceRow,
  type SessionLedgerRow,
  rollUpSessions,
  averageTurnout,
} from './session-cash';

function ledgerRow(overrides: Partial<SessionLedgerRow> = {}): SessionLedgerRow {
  return { type: 'top_up_cash', amountPence: 1000, recordedBy: 'Eoin Mullan', ...overrides };
}

function memberRow(overrides: Partial<SessionAttendanceRow> = {}): SessionAttendanceRow {
  return {
    memberId: 'member-a',
    guestId: null,
    amountPaidPence: null,
    recordedBy: 'Eoin Mullan',
    ...overrides,
  };
}

function guestRow(overrides: Partial<SessionAttendanceRow> = {}): SessionAttendanceRow {
  return {
    memberId: null,
    guestId: 'guest-a',
    amountPaidPence: 200,
    recordedBy: 'Eoin Mullan',
    ...overrides,
  };
}

describe('summariseSessionCash', () => {
  it('adds up the cash handed over at the session', () => {
    const cash = summariseSessionCash({
      ledger: [ledgerRow({ amountPence: 1000 }), ledgerRow({ amountPence: 500 })],
      attendance: [guestRow()],
    });

    expect(cash.totalPence).toBe(1700);
  });

  it('leaves session debits out — they move credit, not money', () => {
    const cash = summariseSessionCash({
      ledger: [
        ledgerRow({ amountPence: 1000 }),
        ledgerRow({ type: 'session', amountPence: -200 }),
        ledgerRow({ type: 'session', amountPence: -200 }),
      ],
      attendance: [memberRow(), memberRow({ memberId: 'member-b' })],
    });

    expect(cash.totalPence).toBe(1000);
  });

  it('nets a refund off, because taking money back is money leaving the tin', () => {
    const cash = summariseSessionCash({
      ledger: [ledgerRow({ amountPence: 1000 }), ledgerRow({ type: 'refund', amountPence: -1000 })],
      attendance: [],
    });

    expect(cash.totalPence).toBe(0);
  });

  it('ignores a top-up that belongs to no session of this night', () => {
    const cash = summariseSessionCash({
      ledger: [ledgerRow({ type: 'manual_adjustment', amountPence: 1000 })],
      attendance: [],
    });

    expect(cash.totalPence).toBe(0);
  });

  it('does not count a member twice — their £2 is already in the ledger', () => {
    const cash = summariseSessionCash({
      ledger: [ledgerRow({ type: 'session', amountPence: -200 })],
      attendance: [memberRow({ amountPaidPence: 200 })],
    });

    expect(cash.totalPence).toBe(0);
  });

  it('splits the total by whoever recorded it, biggest first', () => {
    const cash = summariseSessionCash({
      ledger: [
        ledgerRow({ amountPence: 500, recordedBy: 'Anne Boyle' }),
        ledgerRow({ amountPence: 1000, recordedBy: 'Eoin Mullan' }),
      ],
      attendance: [guestRow({ recordedBy: 'Anne Boyle', amountPaidPence: 200 })],
    });

    expect(cash.byRecorder).toEqual([
      { recordedBy: 'Eoin Mullan', totalPence: 1000 },
      { recordedBy: 'Anne Boyle', totalPence: 700 },
    ]);
  });

  it('breaks a tie by name, so the list does not shuffle between reloads', () => {
    const cash = summariseSessionCash({
      ledger: [
        ledgerRow({ amountPence: 500, recordedBy: 'Eoin Mullan' }),
        ledgerRow({ amountPence: 500, recordedBy: 'Anne Boyle' }),
      ],
      attendance: [],
    });

    expect(cash.byRecorder.map((r) => r.recordedBy)).toEqual(['Anne Boyle', 'Eoin Mullan']);
  });

  it('says so rather than hiding cash nobody is named against', () => {
    const cash = summariseSessionCash({
      ledger: [ledgerRow({ recordedBy: null, amountPence: 1000 })],
      attendance: [],
    });

    expect(cash.byRecorder).toEqual([{ recordedBy: UNATTRIBUTED, totalPence: 1000 }]);
  });

  it('is zero and empty for a session nobody turned up to', () => {
    expect(summariseSessionCash({ ledger: [], attendance: [] })).toEqual({
      totalPence: 0,
      byRecorder: [],
    });
  });
});

describe('countHeads', () => {
  it('counts members and guests apart and together', () => {
    const heads = countHeads([
      memberRow(),
      memberRow({ memberId: 'member-b' }),
      guestRow(),
    ]);

    expect(heads).toEqual({ members: 2, guests: 1, total: 3 });
  });

  it('is zero for an empty session', () => {
    expect(countHeads([])).toEqual({ members: 0, guests: 0, total: 0 });
  });
});

describe('rollUpSessions', () => {
  it('adds every session on the day together', () => {
    const totals = rollUpSessions([
      { heads: { members: 10, guests: 1, total: 11 }, cash: { totalPence: 1200, byRecorder: [{ recordedBy: 'Eoin', totalPence: 1200 }] } },
      { heads: { members: 5, guests: 0, total: 5 }, cash: { totalPence: 500, byRecorder: [{ recordedBy: 'Ciara', totalPence: 300 }, { recordedBy: 'Eoin', totalPence: 200 }] } },
    ]);

    expect(totals).toEqual({
      heads: { members: 15, guests: 1, total: 16 },
      cash: {
        totalPence: 1700,
        byRecorder: [
          { recordedBy: 'Eoin', totalPence: 1400 },
          { recordedBy: 'Ciara', totalPence: 300 },
        ],
      },
    });
  });

  it('is nothing on a day with no sessions', () => {
    expect(rollUpSessions([])).toEqual({ heads: { members: 0, guests: 0, total: 0 }, cash: { totalPence: 0, byRecorder: [] } });
  });
});

describe('averageTurnout', () => {
  const heads = (total: number) => ({ heads: { members: total, guests: 0, total } });

  it('averages the runners across the sessions, to a whole runner', () => {
    expect(averageTurnout([heads(10), heads(13), heads(12)])).toBe(12);
  });

  it('has no average when nothing ran', () => {
    expect(averageTurnout([])).toBeUndefined();
  });
});
