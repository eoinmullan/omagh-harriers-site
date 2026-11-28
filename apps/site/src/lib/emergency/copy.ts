import { clubDayKey, formatClubNight, formatClubTime } from '../training/club-time';
import { matchesName } from '../training/names';

// What the Emergency contacts section keeps on the phone, and the rules about
// keeping it (Phase 8 decisions, 28 November 2026): whatever the section needs
// to work, refreshed on every online open, deleted after a year without a
// refresh, and deleted as soon as the login is found not to hold the flag.
// Signing out leaves it.

export interface ContactPerson {
  memberId: string;
  firstName: string;
  surname: string;
  contactName: string | null;
  /** Null when the member has no contact on file. */
  contactPhone: string | null;
}

export interface SignedInRunner {
  /** Null for a guest, who has no contact on file. */
  memberId: string | null;
  firstName: string;
  surname: string;
}

export interface SessionToday {
  id: string;
  startsAt: string;
  groupName: string;
  isCancelled: boolean;
  signedIn: SignedInRunner[];
}

export interface EmergencyCopy {
  /** The login the copy was taken for, which is who an opening is recorded against. */
  principalId: string;
  people: ContactPerson[];
  sessions: SessionToday[];
}

export const COPY_LIFETIME_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CopyDecision = 'keep' | 'delete';

export function decideAboutCopy(state: { holdsFlag: boolean; savedAt: number; now: Date }): CopyDecision {
  if (!state.holdsFlag) return 'delete';
  return state.now.getTime() - state.savedAt > COPY_LIFETIME_DAYS * DAY_MS ? 'delete' : 'keep';
}

/** Today's sessions in the copy, soonest first. A copy from another day has none. */
export function sessionsToday(copy: EmergencyCopy, now: Date = new Date()): SessionToday[] {
  const today = clubDayKey(now);
  return copy.sessions
    .filter((session) => !session.isCancelled && clubDayKey(session.startsAt) === today)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export function bySurname<T extends { firstName: string; surname: string }>(people: readonly T[]): T[] {
  return [...people].sort(
    (a, b) => a.surname.localeCompare(b.surname, 'en-GB') || a.firstName.localeCompare(b.firstName, 'en-GB'),
  );
}

/** Everybody whose name matches, surname order. An empty term matches everybody. */
export function findPeople(people: readonly ContactPerson[], term: string): ContactPerson[] {
  return bySurname(people.filter((person) => matchesName(person, term)));
}

/**
 * A number as a `tel:` link: digits and a leading plus only, since a phone's
 * dialler takes nothing else. Too short to be a number, and there's no link,
 * only the text as it was given.
 */
export function telHref(phone: string): string | undefined {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 6) return undefined;
  return `tel:${trimmed.startsWith('+') ? '+' : ''}${digits}`;
}

export interface CopyRows {
  principalId: string;
  members: { id: string; first_name: string; surname: string; is_active: boolean }[];
  contacts: { member_id: string; contact_name: string | null; contact_phone: string }[];
  sessions: { id: string; starts_at: string; is_cancelled: boolean; group: { name: string } | null }[];
  attendance: {
    session_id: string;
    member_id: string | null;
    guest: { first_name: string; surname: string } | null;
  }[];
}

/**
 * The copy, from what the database returned. Search covers active members;
 * a session lists whoever is signed in to it, active or not, because somebody
 * on the track is somebody to call for.
 */
export function assembleCopy(rows: CopyRows): EmergencyCopy {
  const contactByMember = new Map(rows.contacts.map((contact) => [contact.member_id, contact]));
  const memberById = new Map(rows.members.map((member) => [member.id, member]));

  const people = rows.members
    .filter((member) => member.is_active)
    .map((member) => ({
      memberId: member.id,
      firstName: member.first_name,
      surname: member.surname,
      contactName: contactByMember.get(member.id)?.contact_name ?? null,
      contactPhone: contactByMember.get(member.id)?.contact_phone ?? null,
    }));

  const sessions = rows.sessions.map((session) => ({
    id: session.id,
    startsAt: session.starts_at,
    groupName: session.group?.name ?? 'A session',
    isCancelled: session.is_cancelled,
    signedIn: bySurname(
      rows.attendance
        .filter((row) => row.session_id === session.id)
        .flatMap((row): SignedInRunner[] => {
          if (row.member_id) {
            const member = memberById.get(row.member_id);
            return member ? [{ memberId: member.id, firstName: member.first_name, surname: member.surname }] : [];
          }
          return row.guest ? [{ memberId: null, firstName: row.guest.first_name, surname: row.guest.surname }] : [];
        }),
    ),
  }));

  return { principalId: rows.principalId, people, sessions };
}

/**
 * Above a screen drawn from the phone's copy rather than a fresh read. It
 * names a time, and a day when it isn't today, since a copy can be months old.
 */
export function describeCopyAge(savedAt: number, now: Date = new Date()): string {
  const saved = new Date(savedAt).toISOString();
  return clubDayKey(savedAt) === clubDayKey(now)
    ? `Saved on this phone at ${formatClubTime(saved)}.`
    : `Saved on this phone on ${formatClubNight(saved)} at ${formatClubTime(saved)}.`;
}
