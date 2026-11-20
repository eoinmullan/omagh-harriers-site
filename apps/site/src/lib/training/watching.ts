// Keeping up with the other phone.
//
// A busy track has more than one registrar signed into the same session.
// Idempotency keys already stop the same runner being charged twice; what is
// left is that neither screen knows what the other has done until somebody
// reloads, so both are quietly describing a night that has moved on.
//
// This is a poll, not a live subscription. Realtime would be the tidier answer
// and is the thing to reach for if a session ever gets busy enough to need it,
// but it is a second moving part to configure and keep inside RLS, and two
// phones twenty seconds out of step is not a problem anybody at a track would
// notice. Said plainly here so the choice is a choice.

/** Often enough that the other phone is never a surprise, rarely enough to be free. */
export const WATCH_INTERVAL_MS = 20_000;

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
