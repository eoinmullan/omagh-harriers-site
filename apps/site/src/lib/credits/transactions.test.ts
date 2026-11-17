import { describe, expect, it } from 'vitest';
import { describeEntry, type LedgerEntry } from './transactions';

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    type: 'top_up_cash',
    amountPence: 1000,
    memberName: null,
    recordedBy: null,
    notes: null,
    ...overrides,
  };
}

describe('describeEntry', () => {
  it('names Stripe as the method for a card top-up', () => {
    const description = describeEntry(entry({ type: 'top_up_stripe', amountPence: 1000 }));

    expect(description).toBe('£10.00 added — paid by card via Stripe');
  });

  it('credits the admin who took a cash payment', () => {
    const description = describeEntry(
      entry({ type: 'top_up_cash', amountPence: 1000, recordedBy: 'Eoin Mullan' }),
    );

    expect(description).toBe('£10.00 added — paid by cash at training, recorded by Eoin Mullan');
  });

  it('omits the recorder when nobody is recorded', () => {
    const description = describeEntry(entry({ type: 'top_up_cash', amountPence: 1000 }));

    expect(description).toBe('£10.00 added — paid by cash at training');
  });

  it('says which member a session was charged for', () => {
    const description = describeEntry(
      entry({ type: 'session', amountPence: -200, memberName: 'Niamh Mullan' }),
    );

    expect(description).toBe('£2.00 deducted — training session for Niamh Mullan');
  });

  it('describes a session with no member attached', () => {
    const description = describeEntry(entry({ type: 'session', amountPence: -200 }));

    expect(description).toBe('£2.00 deducted — training session');
  });

  it('uses the admin note as the reason for an adjustment', () => {
    const description = describeEntry(
      entry({
        type: 'manual_adjustment',
        amountPence: 500,
        notes: 'goodwill credit for a cancelled session',
        recordedBy: 'Eoin Mullan',
      }),
    );

    expect(description).toBe(
      '£5.00 added — goodwill credit for a cancelled session, recorded by Eoin Mullan',
    );
  });

  it('falls back to a plain reason when an adjustment has a blank note', () => {
    const description = describeEntry(
      entry({ type: 'manual_adjustment', amountPence: -300, notes: '   ' }),
    );

    expect(description).toBe('£3.00 deducted — adjusted by the club');
  });

  it('reads an adjustment that takes credit away as a deduction', () => {
    const description = describeEntry(entry({ type: 'manual_adjustment', amountPence: -300 }));

    expect(description).toContain('deducted');
  });

  it('describes both sides of a transfer', () => {
    const out = describeEntry(entry({ type: 'transfer_out', amountPence: -1500 }));
    const into = describeEntry(entry({ type: 'transfer_in', amountPence: 1500 }));

    expect(out).toBe('£15.00 deducted — transferred out to another account');
    expect(into).toBe('£15.00 added — transferred in from another account');
  });

  it('describes a refund as money leaving the account', () => {
    const description = describeEntry(
      entry({ type: 'refund', amountPence: -1000, recordedBy: 'Eoin Mullan' }),
    );

    expect(description).toBe('£10.00 deducted — refunded, recorded by Eoin Mullan');
  });
});
