import { describe, expect, it } from 'vitest';
import { ledgerMoneyKind, summariseMoney } from './money';

describe('ledgerMoneyKind', () => {
  it('tells cash at training from cash an admin recorded', () => {
    expect(ledgerMoneyKind('top_up_cash', true)).toBe('cash at training');
    expect(ledgerMoneyKind('top_up_cash', false)).toBe('cash recorded by an admin');
  });

  it('counts a refund as money handed back', () => {
    expect(ledgerMoneyKind('refund', true)).toBe('handed back at training');
    expect(ledgerMoneyKind('refund', false)).toBe('refunded by an admin');
  });

  it('is not money when credit only moves between pots', () => {
    for (const type of ['session', 'manual_adjustment', 'transfer_in', 'transfer_out'] as const) {
      expect(ledgerMoneyKind(type, true)).toBeUndefined();
    }
  });
});

describe('summariseMoney', () => {
  it('nets what was handed back against what was taken', () => {
    const summary = summariseMoney([
      { kind: 'cash at training', amountPence: 1000, recordedBy: 'Eoin' },
      { kind: 'handed back at training', amountPence: -600, recordedBy: 'Eoin' },
      { kind: 'guest payments', amountPence: 200, recordedBy: 'Ciara' },
    ]);

    expect(summary.totalPence).toBe(600);
  });

  it('totals each kind in a fixed order, leaving out kinds with nothing in them', () => {
    const summary = summariseMoney([
      { kind: 'guest payments', amountPence: 200, recordedBy: 'Eoin' },
      { kind: 'cash at training', amountPence: 1000, recordedBy: 'Eoin' },
      { kind: 'cash at training', amountPence: 500, recordedBy: 'Eoin' },
    ]);

    expect(summary.byKind).toEqual([
      { kind: 'cash at training', totalPence: 1500, entries: 2 },
      { kind: 'guest payments', totalPence: 200, entries: 1 },
    ]);
  });

  it('groups by who recorded it, largest first, naming an entry with no recorder', () => {
    const summary = summariseMoney([
      { kind: 'cash at training', amountPence: 500, recordedBy: 'Ciara' },
      { kind: 'cash at training', amountPence: 1000, recordedBy: 'Eoin' },
      { kind: 'cash recorded by an admin', amountPence: 2000, recordedBy: null },
    ]);

    expect(summary.byRecorder).toEqual([
      { recordedBy: 'Unattributed', totalPence: 2000 },
      { recordedBy: 'Eoin', totalPence: 1000 },
      { recordedBy: 'Ciara', totalPence: 500 },
    ]);
  });
});
