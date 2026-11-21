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

  it('names the other household on a transfer when the reader may know it', () => {
    const out = describeEntry(
      entry({ type: 'transfer_out', amountPence: -1500, counterpartyName: 'Jane Doe' }),
    );
    const into = describeEntry(
      entry({ type: 'transfer_in', amountPence: 1500, counterpartyName: 'John Doe' }),
    );

    expect(out).toBe('£15.00 deducted — transferred out to Jane Doe');
    expect(into).toBe('£15.00 added — transferred in from John Doe');
  });

  it('says whose sign-in an untick corrected, from the member rather than the note', () => {
    const description = describeEntry(
      entry({
        type: 'manual_adjustment',
        amountPence: 200,
        notes: 'Middle Distance sign-in corrected',
        memberName: 'James Conway',
        recordedBy: 'Eoin Mullan',
      }),
    );

    expect(description).toBe(
      '£2.00 added — Middle Distance sign-in corrected for James Conway, recorded by Eoin Mullan',
    );
  });

  it('describes a refund as money leaving the account', () => {
    const description = describeEntry(
      entry({ type: 'refund', amountPence: -1000, recordedBy: 'Eoin Mullan' }),
    );

    expect(description).toBe('£10.00 deducted — refunded, recorded by Eoin Mullan');
  });
});

describe('a refund says why', () => {
  it('uses the note, the way an adjustment does', () => {
    expect(
      describeEntry({
        type: 'refund',
        amountPence: -1000,
        notes: 'Cash handed back at training',
        recordedBy: 'Eoin Mullan',
      }),
    ).toBe('£10.00 deducted — Cash handed back at training, recorded by Eoin Mullan');
  });

  it('falls back to the bare word when there is no note', () => {
    expect(describeEntry({ type: 'refund', amountPence: -500, recordedBy: 'Eoin Mullan' })).toBe(
      '£5.00 deducted — refunded, recorded by Eoin Mullan',
    );
  });

  it('ignores a note that is only whitespace', () => {
    expect(describeEntry({ type: 'refund', amountPence: -500, notes: '   ' })).toBe(
      '£5.00 deducted — refunded',
    );
  });
});

describe('a line tied to a session names the night', () => {
  const tuesday = '2026-11-17T18:30:00Z';

  it('dates a session charge by the session, not by when it was entered', () => {
    const description = describeEntry(
      entry({ type: 'session', amountPence: -200, memberName: 'Jack Kelly', sessionStartsAt: tuesday }),
    );

    expect(description).toBe('£2.00 deducted — training session for Jack Kelly on Tue 17 Nov');
  });

  it('names the squad when the session has one', () => {
    const description = describeEntry({
      type: 'session',
      amountPence: -200,
      memberName: 'Jack Kelly',
      sessionSquad: 'Middle Distance',
      sessionStartsAt: '2026-11-17T18:00:00Z',
    });

    expect(description).toBe('£2.00 deducted — Middle Distance session for Jack Kelly on Tue 17 Nov');
  });

  it('dates cash taken at a session, before saying who recorded it', () => {
    const description = describeEntry(
      entry({ type: 'top_up_cash', amountPence: 1000, recordedBy: 'Eoin Mullan', sessionStartsAt: tuesday }),
    );

    expect(description).toBe('£10.00 added — paid by cash at training on Tue 17 Nov, recorded by Eoin Mullan');
  });

  it('dates the correction of a sign-in', () => {
    const description = describeEntry(
      entry({
        type: 'manual_adjustment',
        amountPence: 200,
        notes: 'Middle Distance sign-in corrected',
        memberName: 'Jack Kelly',
        sessionStartsAt: tuesday,
      }),
    );

    expect(description).toBe('£2.00 added — Middle Distance sign-in corrected for Jack Kelly on Tue 17 Nov');
  });

  it('dates a refund given back at a session', () => {
    const description = describeEntry(
      entry({ type: 'refund', amountPence: -500, sessionStartsAt: tuesday }),
    );

    expect(description).toBe('£5.00 deducted — refunded on Tue 17 Nov');
  });
});
