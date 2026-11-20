import { describe, expect, it } from 'vitest';
import { describeLostWrite, type Names } from './lost-write';

const names: Names = {
  member: (id) => ({ m1: 'Jack Kelly' })[id],
  household: (id) => ({ p1: 'the Kellys' })[id],
  guest: (id) => ({ g1: 'Sam Doyle' })[id],
};

describe('describeLostWrite', () => {
  it('names the runner whose sign-in was lost', () => {
    const text = describeLostWrite(
      { kind: 'sign_in', memberId: 'm1', sessionId: 's', attendanceId: 'a' },
      names,
    );

    expect(text).toBe("Jack Kelly's sign-in wasn't saved.");
  });

  it('says a runner is still signed in when their untick was lost', () => {
    const text = describeLostWrite({ kind: 'undo_sign_in', attendanceId: 'a', memberId: 'm1' }, names);

    expect(text).toBe("Jack Kelly's untick wasn't saved, so they're still signed in.");
  });

  it('copes with an untick queued before it carried the runner', () => {
    const text = describeLostWrite({ kind: 'undo_sign_in', attendanceId: 'a' }, names);

    expect(text).toBe("An untick wasn't saved, so that runner is still signed in.");
  });

  it('tells the registrar to write down cash that was taken but not recorded', () => {
    const text = describeLostWrite(
      {
        kind: 'cash',
        row: { principal_id: 'p1', amount_pence: 1000, type: 'top_up_cash', idempotency_key: 'k' },
      },
      names,
    );

    expect(text).toBe("£10 from the Kellys wasn't recorded. Note it on paper.");
  });

  it('tells the registrar to write down cash handed back but not recorded', () => {
    const text = describeLostWrite(
      {
        kind: 'cash',
        row: { principal_id: 'p1', amount_pence: -500, type: 'refund', idempotency_key: 'k' },
      },
      names,
    );

    expect(text).toBe("£5 handed back to the Kellys wasn't recorded. Note it on paper.");
  });

  it('reminds the registrar a guest may have paid', () => {
    const text = describeLostWrite(
      { kind: 'guest_sign_in', guestId: 'g1', sessionId: 's', pricePence: 200, recordedBy: 'r' },
      names,
    );

    expect(text).toBe("Sam Doyle's sign-in wasn't saved. If they paid, note it on paper.");
  });

  it('names a guest whose untick was lost', () => {
    const text = describeLostWrite({ kind: 'guest_undo', guestId: 'g1', sessionId: 's' }, names);

    expect(text).toBe("Sam Doyle's untick wasn't saved, so they're still signed in.");
  });

  it('says a session that could not be started took the night with it', () => {
    const text = describeLostWrite(
      {
        kind: 'create_session',
        row: { id: 's', group_id: 'g', starts_at: '2026-11-20T19:00:00Z', price_pence: 200, created_by: 'r' },
      },
      names,
    );

    expect(text).toBe(
      "Tonight's session couldn't be started, so nothing on it was saved. Note the night on paper.",
    );
  });

  it('falls back to a plain description when a name is not on this phone', () => {
    const text = describeLostWrite(
      { kind: 'sign_in', memberId: 'unknown', sessionId: 's', attendanceId: 'a' },
      names,
    );

    expect(text).toBe("A runner's sign-in wasn't saved.");
  });
});
