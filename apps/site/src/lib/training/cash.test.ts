import { describe, expect, it } from 'vitest';
import {
  appendDigit,
  cashTonight,
  dropDigit,
  householdsWhoPaid,
  moneyCollected,
  planCashChange,
  type CashRow,
} from './cash';

const ASHBY = 'household-ashby';
const BURNS = 'household-burns';

const change = {
  principalId: ASHBY,
  sessionId: 'session-1',
  recordedBy: 'registrar-1',
  clientId: 'client-abc',
};

describe('cashTonight', () => {
  const rows: CashRow[] = [
    { principalId: ASHBY, type: 'top_up_cash', amountPence: 1000 },
    { principalId: ASHBY, type: 'refund', amountPence: -200 },
    { principalId: BURNS, type: 'top_up_cash', amountPence: 500 },
  ];

  it('nets what was handed over against what was handed back', () => {
    expect(cashTonight(rows, ASHBY)).toBe(800);
  });

  it('keeps one household out of another', () => {
    expect(cashTonight(rows, BURNS)).toBe(500);
  });

  it('is nothing for a household that handed nothing over', () => {
    expect(cashTonight(rows, 'household-nobody')).toBe(0);
  });

  it('ignores the session debit, which moves credit rather than money', () => {
    const withDebit: CashRow[] = [...rows, { principalId: ASHBY, type: 'session', amountPence: -200 }];

    expect(cashTonight(withDebit, ASHBY)).toBe(800);
  });

  it('ignores an adjustment, which is how a mis-tapped charge is given back', () => {
    const withUntick: CashRow[] = [
      ...rows,
      { principalId: ASHBY, type: 'manual_adjustment', amountPence: 200 },
    ];

    expect(cashTonight(withUntick, ASHBY)).toBe(800);
  });
});

describe('moneyCollected', () => {
  it('adds up the night, less anything handed back', () => {
    expect(
      moneyCollected([
        { principalId: ASHBY, type: 'top_up_cash', amountPence: 1000 },
        { principalId: BURNS, type: 'top_up_cash', amountPence: 500 },
        { principalId: ASHBY, type: 'refund', amountPence: -200 },
        { principalId: ASHBY, type: 'session', amountPence: -200 },
      ]),
    ).toBe(1300);
  });

  it('is nothing before anybody has paid', () => {
    expect(moneyCollected([])).toBe(0);
  });

  it('counts what the guests handed over, which is not in the ledger at all', () => {
    expect(
      moneyCollected([{ principalId: ASHBY, type: 'top_up_cash', amountPence: 1000 }], [200, 200]),
    ).toBe(1400);
  });

  it('counts a guest at a free session as nothing rather than crashing on a null', () => {
    expect(moneyCollected([], [null])).toBe(0);
  });

  it('is just the guests when no member handed anything over', () => {
    expect(moneyCollected([], [200])).toBe(200);
  });
});

describe('householdsWhoPaid', () => {
  it('names the households with money against them tonight', () => {
    const paid = householdsWhoPaid([
      { principalId: ASHBY, type: 'top_up_cash', amountPence: 1000 },
      { principalId: BURNS, type: 'session', amountPence: -200 },
    ]);

    expect([...paid]).toEqual([ASHBY]);
  });

  it('drops a household whose money was handed straight back', () => {
    const paid = householdsWhoPaid([
      { principalId: ASHBY, type: 'top_up_cash', amountPence: 1000 },
      { principalId: ASHBY, type: 'refund', amountPence: -1000 },
    ]);

    expect([...paid]).toEqual([]);
  });
});

describe('planCashChange', () => {
  it('takes money as a top-up', () => {
    const row = planCashChange({ ...change, currentPence: 0, targetPence: 1000 });

    expect(row?.type).toBe('top_up_cash');
    expect(row?.amount_pence).toBe(1000);
  });

  it('writes only the difference when the figure goes up', () => {
    const row = planCashChange({ ...change, currentPence: 1000, targetPence: 1500 });

    expect(row?.type).toBe('top_up_cash');
    expect(row?.amount_pence).toBe(500);
  });

  it('hands money back as a refund, never a negative top-up', () => {
    const row = planCashChange({ ...change, currentPence: 1500, targetPence: 1000 });

    expect(row?.type).toBe('refund');
    expect(row?.amount_pence).toBe(-500);
  });

  it('takes it all back when the figure goes to nothing', () => {
    const row = planCashChange({ ...change, currentPence: 1000, targetPence: 0 });

    expect(row?.type).toBe('refund');
    expect(row?.amount_pence).toBe(-1000);
  });

  it('writes nothing when the figure has not moved', () => {
    expect(planCashChange({ ...change, currentPence: 1000, targetPence: 1000 })).toBeUndefined();
  });

  it('writes nothing for a negative figure, which is not a thing to type', () => {
    expect(planCashChange({ ...change, currentPence: 0, targetPence: -500 })).toBeUndefined();
  });

  it('leaves member_id null, because the money belongs to the household', () => {
    const row = planCashChange({ ...change, currentPence: 0, targetPence: 1000 });

    expect(row?.member_id).toBeNull();
    expect(row?.principal_id).toBe(ASHBY);
  });

  it('always carries the session, so the night can be reconciled', () => {
    const row = planCashChange({ ...change, currentPence: 0, targetPence: 1000 });

    expect(row?.session_id).toBe('session-1');
    expect(row?.created_by).toBe('registrar-1');
  });

  it('keys a retry so a resend writes nothing twice', () => {
    const first = planCashChange({ ...change, currentPence: 0, targetPence: 1000 });
    const resent = planCashChange({ ...change, currentPence: 0, targetPence: 1000 });

    expect(first?.idempotency_key).toBe(resent?.idempotency_key);
    expect(first?.idempotency_key).toBe(`cash:${ASHBY}:client-abc`);
  });

  it('keys a take-back apart from a top-up of the same action', () => {
    const row = planCashChange({ ...change, currentPence: 1000, targetPence: 0 });

    expect(row?.idempotency_key).toBe(`refund:${ASHBY}:client-abc`);
  });

  it('obeys the sign CHECK in both directions', () => {
    const up = planCashChange({ ...change, currentPence: 0, targetPence: 500 });
    const down = planCashChange({ ...change, currentPence: 500, targetPence: 0 });

    expect(up!.amount_pence).toBeGreaterThan(0);
    expect(down!.amount_pence).toBeLessThan(0);
  });
});

describe('appendDigit', () => {
  it('shifts digits in from the right, so 1 0 0 is a pound', () => {
    expect(['1', '0', '0'].reduce(appendDigit, 0)).toBe(100);
  });

  it('builds a tenner without a decimal point being typed', () => {
    expect(['1', '0', '0', '0'].reduce(appendDigit, 0)).toBe(1000);
  });

  it('ignores a leading zero rather than counting it', () => {
    expect(appendDigit(0, '0')).toBe(0);
  });

  it('ignores anything that is not a digit', () => {
    expect(appendDigit(500, '.')).toBe(500);
    expect(appendDigit(500, 'a')).toBe(500);
  });

  it('refuses a figure nobody hands over at a track', () => {
    expect(appendDigit(100_000, '0')).toBe(100_000);
  });
});

describe('dropDigit', () => {
  it('takes the last digit off the right', () => {
    expect(dropDigit(1000)).toBe(100);
  });

  it('bottoms out at nothing rather than going negative', () => {
    expect(dropDigit(0)).toBe(0);
    expect(dropDigit(5)).toBe(0);
  });

  it('undoes an append', () => {
    expect(dropDigit(appendDigit(250, '7'))).toBe(250);
  });
});
