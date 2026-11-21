// Keeping up with the other phone.
//
// A busy track has more than one registrar signed into the same session.
// Idempotency keys already stop the same runner being charged twice; what is
// left is that neither screen knows what the other has done until somebody
// reloads, so both are quietly describing a night that has moved on.
//
// Two things keep a screen current. The fast one is a nudge (nudge.ts): when
// the other phone's writes land, it says "something changed" on a Realtime
// Broadcast channel, with no data, and this phone refreshes as soon as the
// rule below allows. That is about a second behind. The slow one is this
// poll, which catches whatever a nudge didn't: a missed message, a change made
// on the admin site, and coming back to the app.
//
// The nudge is deliberately not a subscription to table changes. That would
// mean a migration to publish the tables and merging rows into a screen that
// may be holding this phone's own unsent writes. An empty message asks for
// neither: the refresh that already exists does the rest.

/** The safety net under the nudges: often enough to catch what they miss. */
export const WATCH_INTERVAL_MS = 60_000;

export interface Conditions {
  online: boolean;
  /** Writes this phone still owes. */
  pending: number;
  /** A sheet is open, or a row is mid-write. */
  busy: boolean;
  /** The app is actually on screen. */
  visible: boolean;
}

/**
 * Whether now is a safe moment to take the other phone's word for the night.
 *
 * A refresh replaces what is on screen with what the database says, so it must
 * never happen while this phone is holding something the database has not
 * heard yet — the registrar would watch their own tick disappear. That is the
 * fighting the plan warns about, and `pending` is what prevents it.
 */
export function safeToRefresh(conditions: Conditions): boolean {
  if (!conditions.online) return false;
  if (!conditions.visible) return false;
  if (conditions.busy) return false;

  // Anything owed is also anything optimistic, because the two are the same
  // list seen from either end.
  return conditions.pending === 0;
}
