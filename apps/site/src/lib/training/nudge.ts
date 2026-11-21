import { clubDayKey } from './club-time';
import type { Write } from './queue';

// Telling the other phone that something changed.
//
// When this phone's writes land, it sends an empty message on a Supabase
// Realtime Broadcast channel: "something changed, refresh when you can". It
// carries no data, so there is nothing to merge and nothing for RLS to check.
// The phone that hears it runs the refresh it already has, through the same
// `safeToRefresh` rule as the poll, so it still waits behind its own pending
// writes and an open cash sheet.
//
// Broadcast needs no migration and no table in Realtime's publication. The
// channels aren't private, so anybody holding the public key and a channel
// name could send one, but the message carries nothing and the worst it can
// do is make a phone refresh; session ids are random UUIDs besides. A nudge
// can also be missed, which is why the poll stays, only slower.
//
// The registrar app nudges when its writes land, and so does the admin site
// when an admin's change succeeds (`channelsForAdminChange`), so somebody
// setting things up at the last minute reaches the phones straight away.

export const NUDGE_EVENT = 'changed';

/** Everybody with this session open. */
export function sessionChannel(sessionId: string): string {
  return `session-${sessionId}`;
}

/** Everybody looking at the list of one day's sessions. */
export function dayChannel(clubDay: string): string {
  return `sessions-${clubDay}`;
}

/**
 * Which channels to nudge for writes that have just landed, each once.
 *
 * An untick queued before it carried its session can't say which session it
 * belonged to, so it nudges nobody, and the other phone's poll picks it up.
 */
export function channelsToNudge(writes: Write[]): string[] {
  const channels = new Set<string>();

  for (const write of writes) {
    switch (write.kind) {
      case 'create_session':
        channels.add(dayChannel(clubDayKey(write.row.starts_at)));
        if (write.row.id) channels.add(sessionChannel(write.row.id));
        break;
      case 'sign_in':
      case 'guest_sign_in':
      case 'guest_undo':
        channels.add(sessionChannel(write.sessionId));
        break;
      case 'undo_sign_in':
        if (write.sessionId) channels.add(sessionChannel(write.sessionId));
        break;
      case 'cash':
        if (write.row.session_id) channels.add(sessionChannel(write.row.session_id));
        break;
    }
  }

  return [...channels];
}

/**
 * Which channels an admin's change should nudge.
 *
 * Every admin form changes something the registrar app shows: a session, a
 * squad or who's in it, a household's balance or name. Working out exactly
 * which phones care would be more machinery than it saves, and the admin
 * site is quiet while sessions run, so a change nudges today: the session
 * list and every session on today. A change to one particular session also
 * nudges that session and its own day, which may not be today.
 */
export function channelsForAdminChange(change: {
  today: string;
  todaysSessionIds: string[];
  /** A new session's id may not be known yet; its day is what matters then. */
  session?: { id?: string; startsAt: string };
}): string[] {
  const channels = new Set<string>([dayChannel(change.today), ...change.todaysSessionIds.map(sessionChannel)]);
  if (change.session) {
    if (change.session.id) channels.add(sessionChannel(change.session.id));
    channels.add(dayChannel(clubDayKey(change.session.startsAt)));
  }
  return [...channels];
}
