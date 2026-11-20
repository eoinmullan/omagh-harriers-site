import { describe, expect, it } from 'vitest';
import {
  enqueue,
  failureFrom,
  isWorthRetrying,
  moneyCaveat,
  nextToSend,
  settle,
  type Queued,
  type Write,
} from './queue';

let tick = 0;
function queued(write: Write, id = `q${++tick}`): Queued {
  return { id, write, queuedAt: tick };
}

const signIn: Write = {
  kind: 'sign_in',
  memberId: 'jack',
  sessionId: 's1',
  attendanceId: 'a1',
};
const undoSignIn: Write = { kind: 'undo_sign_in', attendanceId: 'a1' };
const guestIn: Write = {
  kind: 'guest_sign_in',
  guestId: 'g1',
  sessionId: 's1',
  pricePence: 200,
  recordedBy: 'registrar-1',
};
const guestOut: Write = { kind: 'guest_undo', guestId: 'g1', sessionId: 's1' };
const cash: Write = {
  kind: 'cash',
  row: {
    principal_id: 'p1',
    amount_pence: 1000,
    type: 'top_up_cash',
    idempotency_key: 'cash:p1:c1',
    session_id: 's1',
  },
};

describe('enqueue', () => {
  it('adds a write to the back', () => {
    const queue = enqueue([], queued(signIn));

    expect(queue).toHaveLength(1);
  });

  it('cancels a mis-tap before the database ever hears about it', () => {
    const queue = enqueue(enqueue([], queued(signIn)), queued(undoSignIn));

    expect(queue).toEqual([]);
  });

  it('cancels a guest mis-tap the same way', () => {
    const queue = enqueue(enqueue([], queued(guestIn)), queued(guestOut));

    expect(queue).toEqual([]);
  });

  it('leaves an untick that has nothing to cancel, so it is a real reversal', () => {
    const queue = enqueue([], queued(undoSignIn));

    expect(queue).toHaveLength(1);
    expect(queue[0]!.write.kind).toBe('undo_sign_in');
  });

  it('only cancels the sign-in it actually undoes', () => {
    const other: Write = { ...signIn, memberId: 'sophie', attendanceId: 'a2' };
    const queue = enqueue(enqueue([], queued(other)), queued(undoSignIn));

    expect(queue).toHaveLength(2);
  });

  it('only cancels the guest it actually undoes', () => {
    const otherGuest: Write = { ...guestIn, kind: 'guest_sign_in', guestId: 'g2' };
    const queue = enqueue(enqueue([], queued(otherGuest)), queued(guestOut));

    expect(queue).toHaveLength(2);
  });

  it('does not cancel a guest from another session', () => {
    const elsewhere: Write = { ...guestIn, kind: 'guest_sign_in', sessionId: 's2' };
    const queue = enqueue(enqueue([], queued(elsewhere)), queued(guestOut));

    expect(queue).toHaveLength(2);
  });

  it('never cancels cash, because each entry is a difference from the last', () => {
    const takeBack: Write = {
      kind: 'cash',
      row: { ...cash.row, amount_pence: -1000, type: 'refund', idempotency_key: 'refund:p1:c2' },
    };
    const queue = enqueue(enqueue([], queued(cash)), queued(takeBack));

    expect(queue).toHaveLength(2);
  });

  it('cancels only the one pending sign-in, not an earlier identical pair', () => {
    const ticked = enqueue([], queued(signIn));
    const unticked = enqueue(ticked, queued(undoSignIn));
    const tickedAgain = enqueue(unticked, queued(signIn));

    expect(tickedAgain).toHaveLength(1);
    expect(tickedAgain[0]!.write.kind).toBe('sign_in');
  });

  it('keeps everything else in the order it was tapped', () => {
    const queue = [queued(cash), queued(signIn), queued(guestIn)].reduce(enqueue, [] as Queued[]);

    expect(queue.map((q) => q.write.kind)).toEqual(['cash', 'sign_in', 'guest_sign_in']);
  });
});

describe('nextToSend', () => {
  it('sends the oldest first, so a tick never lands after its own untick', () => {
    const queue = [queued(signIn, 'first'), queued(cash, 'second')].reduce(
      enqueue,
      [] as Queued[],
    );

    expect(nextToSend(queue)?.id).toBe('first');
  });

  it('has nothing to send when the queue is empty', () => {
    expect(nextToSend([])).toBeUndefined();
  });
});

describe('settle', () => {
  it('takes out only what landed', () => {
    const queue = [queued(signIn, 'a'), queued(cash, 'b')].reduce(enqueue, [] as Queued[]);

    expect(settle(queue, 'a').map((q) => q.id)).toEqual(['b']);
  });

  it('is quiet about a write that is already gone, so a double flush is safe', () => {
    expect(settle([queued(cash, 'b')], 'a').map((q) => q.id)).toEqual(['b']);
  });
});

describe('isWorthRetrying', () => {
  it('retries a request that never arrived', () => {
    expect(isWorthRetrying({})).toBe(true);
    expect(isWorthRetrying({ status: 0, message: 'Failed to fetch' })).toBe(true);
  });

  it('retries a timeout, a rate limit and a broken server', () => {
    expect(isWorthRetrying({ status: 408 })).toBe(true);
    expect(isWorthRetrying({ status: 429 })).toBe(true);
    expect(isWorthRetrying({ status: 503 })).toBe(true);
  });

  it('gives up on a refusal, which is the app being wrong', () => {
    expect(isWorthRetrying({ status: 400 })).toBe(false);
    expect(isWorthRetrying({ status: 403 })).toBe(false);
    expect(isWorthRetrying({ status: 409 })).toBe(false);
  });

  it('retries when PostgREST is up but cannot reach the database', () => {
    expect(isWorthRetrying({ status: 503, code: 'PGRST000' })).toBe(true);
    expect(isWorthRetrying({ status: 503, code: 'PGRST001' })).toBe(true);
    expect(isWorthRetrying({ status: 503, code: 'PGRST002' })).toBe(true);
    expect(isWorthRetrying({ status: 504, code: 'PGRST003' })).toBe(true);
  });

  it('retries the database errors that mean "try again", whatever status they come with', () => {
    expect(isWorthRetrying({ status: 500, code: '57014' })).toBe(true);
    expect(isWorthRetrying({ status: 409, code: '40001' })).toBe(true);
    expect(isWorthRetrying({ status: 409, code: '40P01' })).toBe(true);
    expect(isWorthRetrying({ status: 400, code: '53300' })).toBe(true);
    expect(isWorthRetrying({ status: 400, code: '08006' })).toBe(true);
    expect(isWorthRetrying({ status: 400, code: '57P01' })).toBe(true);
  });

  it('still gives up on our own refusals and on rules the row broke', () => {
    expect(isWorthRetrying({ status: 400, code: 'P0001', message: 'That session was cancelled.' })).toBe(false);
    expect(isWorthRetrying({ status: 403, code: '42501' })).toBe(false);
    expect(isWorthRetrying({ status: 400, code: '23514' })).toBe(false);
    expect(isWorthRetrying({ status: 409, code: '23503' })).toBe(false);
  });
});

describe('failureFrom', () => {
  it('is nothing when the write landed', () => {
    expect(failureFrom({ error: null, status: 201 })).toBeUndefined();
  });

  it('keeps the status the server actually sent, not one guessed from the code', () => {
    const failure = failureFrom({
      error: { message: 'Could not connect with the database', code: 'PGRST001' },
      status: 503,
    });

    expect(failure).toEqual({
      status: 503,
      code: 'PGRST001',
      message: 'Could not connect with the database',
    });
  });

  it('treats a request that never arrived as having no status', () => {
    const failure = failureFrom({ error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 });

    expect(failure?.status).toBe(0);
    expect(failure?.code).toBeUndefined();
  });

  it('retries a database outage end to end, which it used to drop', () => {
    const failure = failureFrom({
      error: { message: 'Could not connect with the database', code: 'PGRST001' },
      status: 503,
    });

    expect(isWorthRetrying(failure!)).toBe(true);
  });
});

describe('moneyCaveat', () => {
  it('says nothing when everything has landed', () => {
    expect(moneyCaveat({ pending: 0, online: true })).toBeUndefined();
  });

  it('admits the figure is still settling', () => {
    expect(moneyCaveat({ pending: 2, online: true })).toBe('2 changes still sending.');
  });

  it('counts one change as one', () => {
    expect(moneyCaveat({ pending: 1, online: true })).toBe('1 change still sending.');
  });

  it('warns offline that another phone may be missing from the figure', () => {
    expect(moneyCaveat({ pending: 0, online: false })).toBe(
      "Offline — another phone's takings may be missing.",
    );
  });

  it('says both things at once when offline with work waiting', () => {
    expect(moneyCaveat({ pending: 3, online: false })).toBe(
      "Offline — 3 changes waiting to send, and another phone's may be missing.",
    );
  });
});

describe('a session started at the track', () => {
  const createSession: Write = {
    kind: 'create_session',
    row: {
      id: 'client-made',
      group_id: 'g1',
      starts_at: '2026-11-19T19:00:00.000Z',
      price_pence: 200,
      created_by: 'registrar-1',
    },
  };

  it('is never cancelled out, because attendance is queued behind it', () => {
    const queue = [queued(createSession), queued(signIn), queued(undoSignIn)].reduce(
      enqueue,
      [] as Queued[],
    );

    expect(queue.map((q) => q.write.kind)).toEqual(['create_session']);
  });

  it('stays at the front, so the session exists before anything references it', () => {
    const queue = [queued(createSession, 'first'), queued(signIn, 'second')].reduce(
      enqueue,
      [] as Queued[],
    );

    expect(nextToSend(queue)?.id).toBe('first');
  });

  it('survives a mis-tap cancelling the sign-in that followed it', () => {
    const queue = [queued(createSession), queued(signIn), queued(undoSignIn)].reduce(
      enqueue,
      [] as Queued[],
    );

    expect(queue).toHaveLength(1);
    expect(queue[0]!.write.kind).toBe('create_session');
  });
});
