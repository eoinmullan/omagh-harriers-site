import { DEFAULT_SESSION_PRICE_PENCE } from '../credits/ledger';
import type { TrainingSessionInsert } from '../supabase/types';
import { clubDayKey } from './club-time';
import type { SelectableSession } from './tonight';

// Starting a session at the track, because nobody got round to it beforehand.
//
// Spond makes an admin create every session in advance. Treating that as a bug:
// a registrar turns up, finds nothing, makes one, and starts ticking people in.
// Creating sessions in the admin console stays the tidier way to do it ahead of
// time, but nothing depends on it having happened.

export interface SessionGroup {
  id: string;
  name: string;
}

/**
 * The session a registrar is about to start.
 *
 * **The id is minted here, on the phone.** That is what lets the session be
 * created with no signal and still be one session: a retry presents the same
 * id, and the attendance rows queued behind it already reference it. Postgres
 * generating it would mean nothing could be ticked until the write had landed.
 *
 * It starts now. A registrar creating a session is standing at the track with
 * runners in front of them, and asking them to pick a time in the cold would be
 * a question with only one sensible answer.
 *
 * The name is the group's. Admins can rename it afterwards; a registrar cannot,
 * so offering a text box would be offering something the app cannot keep.
 */
export function planTrackSession(request: {
  group: SessionGroup;
  createdBy: string;
  id: string;
  now?: Date;
}): TrainingSessionInsert {
  const now = request.now ?? new Date();

  return {
    id: request.id,
    name: request.group.name,
    group_id: request.group.id,
    starts_at: now.toISOString(),
    price_pence: DEFAULT_SESSION_PRICE_PENCE,
    created_by: request.createdBy,
  };
}

/**
 * Sessions already on tonight for this group.
 *
 * A busy track has more than one phone open, and two registrars each starting
 * "Endurance" would split the evening in half: two headcounts, two Money
 * collected figures, and members charged against whichever row their registrar
 * happened to be holding. Idempotency keys do not help — those are two
 * genuinely different sessions as far as the database is concerned.
 *
 * So the app warns and names what is already there. It does not refuse: the
 * schema deliberately lets a member train twice in a day, and a group really
 * can train twice. The registrar is the one who can see the track.
 */
export function alreadyOnTonight(
  sessions: SelectableSession[],
  groupId: string,
  now: Date = new Date(),
): SelectableSession[] {
  const today = clubDayKey(now);

  return sessions.filter(
    (session) =>
      session.groupId === groupId &&
      !session.isCancelled &&
      clubDayKey(session.startsAt) === today,
  );
}
