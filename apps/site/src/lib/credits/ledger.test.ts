import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SESSION_PRICE_PENCE,
  planAdjustment,
  planCashTopUp,
  planSessionDebit,
  planTransfer,
  type Household,
  type LedgerWrite,
} from './ledger';
import type { CreditTransactionInsert } from '../supabase/types';

const ADMIN = 'admin-principal-id';
const KEY = 'idem-key';

function household(overrides: Partial<Household> = {}): Household {
  return { id: 'household-a', displayName: 'John Doe', balancePence: 0, ...overrides };
}

function rowsOf(write: LedgerWrite): CreditTransactionInsert[] {
  if ('problem' in write) throw new Error(`expected rows, got problem: ${write.problem}`);
  return write.rows;
}

function problemOf(write: LedgerWrite): string {
  if (!('problem' in write)) throw new Error('expected a problem, got rows');
  return write.problem;
}

describe('planCashTopUp', () => {
  it('writes one positive row attributed to the admin', () => {
    const write = planCashTopUp({
      household: household(),
      amount: '10',
      note: '',
      recordedBy: ADMIN,
      idempotencyKey: KEY,
    });

    expect(rowsOf(write)).toEqual([
      {
        principal_id: 'household-a',
        amount_pence: 1000,
        type: 'top_up_cash',
        idempotency_key: KEY,
        notes: null,
        created_by: ADMIN,
      },
    ]);
  });

  it('keeps a note when the admin writes one', () => {
    const write = planCashTopUp({
      household: household(),
      amount: '10',
      note: '  paid at Monday track  ',
      recordedBy: ADMIN,
      idempotencyKey: KEY,
    });

    expect(rowsOf(write)[0].notes).toBe('paid at Monday track');
  });

  it('refuses an amount it cannot read', () => {
    const write = planCashTopUp({
      household: household(),
      amount: 'a tenner',
      note: '',
      recordedBy: ADMIN,
      idempotencyKey: KEY,
    });

    expect(problemOf(write)).toContain('amount paid');
  });
});

describe('planAdjustment', () => {
  it('adds credit as a positive row', () => {
    const write = planAdjustment({
      household: household(),
      amount: '5',
      direction: 'add',
      note: 'goodwill for a cancelled session',
      recordedBy: ADMIN,
      idempotencyKey: KEY,
    });

    expect(rowsOf(write)[0].amount_pence).toBe(500);
    expect(rowsOf(write)[0].type).toBe('manual_adjustment');
  });

  it('removes credit as a negative row', () => {
    const write = planAdjustment({
      household: household(),
      amount: '5',
      direction: 'remove',
      note: 'double-counted a cash payment',
      recordedBy: ADMIN,
      idempotencyKey: KEY,
    });

    expect(rowsOf(write)[0].amount_pence).toBe(-500);
  });

  it('insists on a note, because an unexplained adjustment is unauditable', () => {
    const write = planAdjustment({
      household: household(),
      amount: '5',
      direction: 'add',
      note: '   ',
      recordedBy: ADMIN,
      idempotencyKey: KEY,
    });

    expect(problemOf(write)).toContain('note');
  });

  it('refuses a direction it does not recognise', () => {
    const write = planAdjustment({
      household: household(),
      amount: '5',
      direction: 'sideways',
      note: 'a note',
      recordedBy: ADMIN,
      idempotencyKey: KEY,
    });

    expect(problemOf(write)).toContain('add or remove');
  });
});

describe('planTransfer', () => {
  const source = household({ id: 'source-id', displayName: 'John Doe', balancePence: 1500 });
  const target = household({ id: 'target-id', displayName: 'Jane Doe', balancePence: 0 });

  function transfer(overrides: Partial<Parameters<typeof planTransfer>[0]> = {}) {
    return planTransfer({
      source,
      target,
      amount: '',
      note: 'contact email changed in Klubfunder',
      recordedBy: ADMIN,
      idempotencyKey: KEY,
      ...overrides,
    });
  }

  it('moves the whole balance when no amount is given', () => {
    const rows = rowsOf(transfer());

    expect(rows.map((row) => row.amount_pence)).toEqual([-1500, 1500]);
  });

  it('moves part of the balance when an amount is given', () => {
    const rows = rowsOf(transfer({ amount: '5.50' }));

    expect(rows.map((row) => row.amount_pence)).toEqual([-550, 550]);
  });

  it('writes both sides as one insert so neither can land alone', () => {
    const rows = rowsOf(transfer());

    expect(rows).toHaveLength(2);
    expect(rows[0].principal_id).toBe('source-id');
    expect(rows[1].principal_id).toBe('target-id');
  });

  it('types each side of the pair', () => {
    const rows = rowsOf(transfer());

    expect(rows[0].type).toBe('transfer_out');
    expect(rows[1].type).toBe('transfer_in');
  });

  it('names the other household in each note', () => {
    const rows = rowsOf(transfer());

    expect(rows[0].notes).toBe(
      'Transferred to Jane Doe — contact email changed in Klubfunder',
    );
    expect(rows[1].notes).toBe(
      'Transferred from John Doe — contact email changed in Klubfunder',
    );
  });

  it('gives each side its own idempotency key', () => {
    const rows = rowsOf(transfer());

    expect(rows[0].idempotency_key).toBe('idem-key:out');
    expect(rows[1].idempotency_key).toBe('idem-key:in');
  });

  it('refuses to move more than the source holds', () => {
    const write = transfer({ amount: '20' });

    expect(problemOf(write)).toBe('John Doe only holds £15.00.');
  });

  it('refuses a source with nothing in it', () => {
    const write = transfer({ source: household({ id: 'empty', displayName: 'Empty', balancePence: 0 }) });

    expect(problemOf(write)).toBe('Empty has no balance to transfer.');
  });

  it('refuses an overdrawn source', () => {
    const write = transfer({ source: household({ displayName: 'Owing', balancePence: -200 }) });

    expect(problemOf(write)).toContain('no balance to transfer');
  });

  it('refuses a transfer to the same household', () => {
    const write = transfer({ target: source });

    expect(problemOf(write)).toContain('different household');
  });

  it('refuses a transfer with no target chosen', () => {
    const write = transfer({ target: undefined });

    expect(problemOf(write)).toContain('transfer the balance to');
  });

  it('insists on a note', () => {
    const write = transfer({ note: '' });

    expect(problemOf(write)).toContain('note');
  });
});

describe('planSessionDebit', () => {
  function debit(overrides: Partial<Parameters<typeof planSessionDebit>[0]> = {}) {
    return planSessionDebit({
      household: household(),
      memberId: null,
      amount: '2',
      note: '',
      recordedBy: ADMIN,
      idempotencyKey: KEY,
      ...overrides,
    });
  }

  it('takes credit off the household as a session row', () => {
    const rows = rowsOf(debit());

    expect(rows).toEqual([
      {
        principal_id: 'household-a',
        member_id: null,
        amount_pence: -200,
        type: 'session',
        idempotency_key: KEY,
        notes: null,
        created_by: ADMIN,
      },
    ]);
  });

  it('attributes the session to a member when one is named', () => {
    const rows = rowsOf(debit({ memberId: 'member-niamh' }));

    expect(rows[0].member_id).toBe('member-niamh');
  });

  it('charges whatever the session actually cost, not only the default', () => {
    const rows = rowsOf(debit({ amount: '3.50' }));

    expect(rows[0].amount_pence).toBe(-350);
  });

  it('keeps a note describing the session', () => {
    const rows = rowsOf(debit({ note: 'Monday track' }));

    expect(rows[0].notes).toBe('Monday track');
  });

  it('refuses an amount it cannot read', () => {
    expect(problemOf(debit({ amount: 'two quid' }))).toContain('session charge');
  });

  it('refuses a zero charge', () => {
    expect(problemOf(debit({ amount: '0' }))).toContain('session charge');
  });
});

describe('DEFAULT_SESSION_PRICE_PENCE', () => {
  it('is the £2 the club has charged for years', () => {
    expect(DEFAULT_SESSION_PRICE_PENCE).toBe(200);
  });
});
