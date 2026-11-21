import type { GuestInsert } from '../supabase/types';
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
