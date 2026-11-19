import type { CreditTransactionInsert } from '../supabase/types';

// The write queue: what a tap becomes before it reaches the database.
//
// Training venues mostly have coverage, so the common failure is not a phone
// with no signal but a phone whose request hangs for twenty seconds in a
// leisure centre. Either way the registrar must not be made to wait, and the
// screen must not lie about what has landed.
//
// Two properties make this safe, and both are decided at the moment of the tap
// rather than at the moment of the write:
//
//   1. Every write carries its own identity. A retry hours later presents the
//      same key and the database refuses the duplicate.
//   2. The attendance row's id is generated here, not by Postgres. That is what
//      lets an untick name the row it reverses while that row is still only a
//      promise sitting in this queue.

export interface SignIn {
  kind: 'sign_in';
  memberId: string;
  sessionId: string;
  /** Minted at tick time, so the untick has something to name. */
  attendanceId: string;
}

export interface UndoSignIn {
  kind: 'undo_sign_in';
  attendanceId: string;
}

export interface GuestSignIn {
  kind: 'guest_sign_in';
  guestId: string;
  sessionId: string;
  pricePence: number;
}

export interface GuestUndo {
  kind: 'guest_undo';
  guestId: string;
  sessionId: string;
}

export interface Cash {
  kind: 'cash';
  row: CreditTransactionInsert;
}

export type Write = SignIn | UndoSignIn | GuestSignIn | GuestUndo | Cash;

export interface Queued {
  /** Stable across retries, and what the store keys on. */
  id: string;
  write: Write;
  queuedAt: number;
}

/**
 * Add a write, cancelling anything still waiting that it undoes.
 *
 * This is the coalescing window in its only honest form. A registrar who taps a
 * name and taps it again two seconds later has not changed their mind twice —
 * they mis-tapped — and the database should never hear about either. Letting
 * the pair through would leave a charge and a compensating adjustment on a
 * member's statement for something that never happened.
 *
 * Once a write has left, it is history and the reversal is a real reversal.
 * That is the difference between this and an undo button.
 */
export function enqueue(queue: Queued[], item: Queued): Queued[] {
  const cancels = whatItCancels(item.write);
  if (!cancels) return [...queue, item];

  const at = queue.findIndex((pending) => cancels(pending.write));
  if (at === -1) return [...queue, item];

  return [...queue.slice(0, at), ...queue.slice(at + 1)];
}

function whatItCancels(write: Write): ((pending: Write) => boolean) | undefined {
  if (write.kind === 'undo_sign_in') {
    return (pending) =>
      pending.kind === 'sign_in' && pending.attendanceId === write.attendanceId;
  }

  if (write.kind === 'guest_undo') {
    return (pending) =>
      pending.kind === 'guest_sign_in' &&
      pending.guestId === write.guestId &&
      pending.sessionId === write.sessionId;
  }

  // Cash is never cancelled. Each entry is a difference from the figure that
  // was on screen when it was made, so dropping one silently changes what the
  // others mean.
  return undefined;
}

/** Oldest first. Order is kept so a tick never arrives after its own untick. */
export function nextToSend(queue: Queued[]): Queued | undefined {
  return queue[0];
}

export function settle(queue: Queued[], id: string): Queued[] {
  return queue.filter((item) => item.id !== id);
}

/**
 * Whether to try this write again, or give up and tell the registrar.
 *
 * A dropped connection is the normal case and must be retried forever —
 * abandoning a sign-in because a leisure centre's wifi blinked is how somebody
 * ends up unrecorded. A refusal from Postgres is the app being wrong, and
 * retrying it just hides the problem until the end of the night.
 */
export function isWorthRetrying(failure: { status?: number; message?: string }): boolean {
  const status = failure.status;

  // No status at all means the request never reached PostgREST.
  if (status === undefined || status === 0) return true;

  // 408 timeout, 429 too many, and anything the server broke on.
  if (status === 408 || status === 429 || status >= 500) return true;

  return false;
}

/**
 * What the night's figures are worth right now.
 *
 * A registrar working offline sees what their own phone has taken, not the
 * session's, and the screen has to say so rather than show a confident wrong
 * number. The caveat belongs under the figure, not in its label, so the common
 * case reads plainly and the exception announces itself.
 */
export function moneyCaveat(state: { pending: number; online: boolean }): string | undefined {
  if (!state.online) {
    return state.pending > 0
      ? `Offline — ${countOf(state.pending)} waiting to send, and another phone's may be missing.`
      : "Offline — another phone's takings may be missing.";
  }

  return state.pending > 0 ? `${countOf(state.pending)} still sending.` : undefined;
}

function countOf(pending: number): string {
  return pending === 1 ? '1 change' : `${pending} changes`;
}
