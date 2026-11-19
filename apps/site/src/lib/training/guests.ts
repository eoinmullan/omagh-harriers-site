import type { AttendanceInsert, GuestInsert } from '../supabase/types';
import { matchesName } from './names';

// A non-member at a session: a name, an attendance row, and the money taken at
// the time. No account, no credit, no balance that could go negative.

export interface Guest {
  id: string;
  firstName: string;
  surname: string;
}

/** Surname first, like everyone else on the screen. */
export function guestsToShow(guests: Guest[], term?: string): Guest[] {
  const needle = term?.trim() ?? '';

  return guests
    .filter((guest) => !needle || matchesName(guest, needle))
    .sort(
      (a, b) => a.surname.localeCompare(b.surname) || a.firstName.localeCompare(b.firstName),
    );
}

/**
 * Signing a guest in: one row, and the cash is on it.
 *
 * A member's £2 comes out of the household pot and so lives in the ledger. A
 * guest has no pot, so what they handed over is recorded on the attendance row
 * itself — which is also why unticking them takes the money with it, and why
 * there is nothing to compensate against.
 *
 * A free session records **null, not zero**: the column is nullable but checked
 * `> 0`, so a zero would be refused where an absent figure is fine. "They paid
 * nothing" and "we are not recording what they paid" are the same fact here.
 */
export function planGuestSignIn(request: {
  guestId: string;
  sessionId: string;
  recordedBy: string;
  pricePence: number;
}): AttendanceInsert {
  return {
    session_id: request.sessionId,
    guest_id: request.guestId,
    member_id: null,
    amount_paid_pence: request.pricePence > 0 ? request.pricePence : null,
    recorded_by: request.recordedBy,
    idempotency_key: `attendance:guest:${request.guestId}:${request.sessionId}`,
  };
}

export type GuestCreation = { insert: GuestInsert } | { problem: string };

/**
 * Adding a guest nobody has seen before.
 *
 * **A repeated name is not refused.** The table carries no uniqueness on names
 * on purpose: two genuine Jack Kellys would collide, and a constraint violation
 * in front of a queue is the exact failure this phase exists to avoid. Keeping
 * one person from becoming three is the picker's job — `likelyAlready` is what
 * it offers before this is ever called.
 */
export function planNewGuest(request: {
  firstName: string;
  surname: string;
  createdBy: string;
}): GuestCreation {
  const firstName = request.firstName.trim();
  const surname = request.surname.trim();

  if (!firstName || !surname) {
    return { problem: 'A guest needs a first name and a surname.' };
  }

  return { insert: { first_name: firstName, surname, created_by: request.createdBy } };
}

/**
 * Guests already on file who look like the one being typed, so a returning
 * non-member is a tap rather than a retype — and so the same person does not
 * become three spellings over a season.
 */
export function likelyAlready(guests: Guest[], firstName: string, surname: string): Guest[] {
  const typed = `${firstName} ${surname}`.trim();
  if (!typed) return [];

  return guestsToShow(
    guests.filter(
      (guest) =>
        (surname.trim() && matchesName(guest, surname.trim())) ||
        (firstName.trim() && matchesName(guest, firstName.trim())),
    ),
  );
}
