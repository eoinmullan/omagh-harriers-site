import type { MemberInsert, MemberStatus } from './supabase/types';

// The rules for the screens that edit people: adding a household, adding a
// member, editing a member, renaming a household.
//
// Everywhere else the admin area keeps its rules in a tested lib module and
// the page decides nothing (ledger.ts, roles.ts, groups.ts, sessions.ts).
// These four screens were the exception. Their checks lived in the page,
// untested, and only checked that fields were filled in, so a date of birth
// in 2109 was accepted. They're also the screens an admin uses by hand most
// often. Same shape as ledger.ts: a row to write, or one sentence.

export type Plan<Key extends string, Value> = { [K in Key]: Value } | { problem: string };

export interface PersonFields {
  firstName: string;
  surname: string;
  dateOfBirth: string;
  gender: string;
  associationNumber: string;
}

type PersonColumns = Pick<
  MemberInsert,
  'first_name' | 'surname' | 'date_of_birth' | 'gender' | 'athletic_association_number'
>;

export function planMember(
  request: PersonFields & { principalId: string },
  today: string,
): Plan<'row', MemberInsert> {
  if (!request.principalId) return { problem: 'Choose the household this member belongs to.' };

  const person = personColumns(request, today);
  if ('problem' in person) return person;

  return { row: { principal_id: request.principalId, ...person.columns, source: 'manual', status: 'paid' } };
}

export function planMemberEdit(
  request: PersonFields & { status: string },
  today: string,
): Plan<'update', PersonColumns & { status: MemberStatus }> {
  const person = personColumns(request, today);
  if ('problem' in person) return person;

  if (request.status !== 'paid' && request.status !== 'lapsed') {
    return { problem: 'Choose whether the membership is paid or lapsed.' };
  }

  return { update: { ...person.columns, status: request.status } };
}

export function planHousehold(request: {
  email: string;
  displayName: string;
}): Plan<'row', { email: string; display_name: string; source: 'manual'; role: 'member' }> {
  const email = request.email.trim().toLowerCase();
  if (!email) return { problem: "Enter the household's email address." };
  if (!LOOKS_LIKE_EMAIL.test(email)) return { problem: "That doesn't look like an email address." };

  const name = planDisplayName(request.displayName);
  if ('problem' in name) return name;

  return { row: { email, display_name: name.displayName, source: 'manual', role: 'member' } };
}

export const FREE_TRAINING_REASON_MAX = 60;

// Training free is a setting on the member, with a short reason so the next
// committee knows why. Turning it off clears the reason, which the database
// also insists on.
export function planFreeTraining(request: {
  trainsFree: string;
  reason: string;
}): Plan<'update', { trains_free: boolean; trains_free_reason: string | null }> {
  if (request.trainsFree !== 'yes') return { update: { trains_free: false, trains_free_reason: null } };

  const reason = request.reason.trim().replace(/\s+/g, ' ');
  if (!reason) return { problem: 'Say why they train free, such as Coach or Life member.' };
  if (reason.length > FREE_TRAINING_REASON_MAX) {
    return { problem: `Keep the reason to ${FREE_TRAINING_REASON_MAX} characters. It's a label, not a note.` };
  }
  return { update: { trains_free: true, trains_free_reason: reason } };
}

export function planDisplayName(value: string): Plan<'displayName', string> {
  const displayName = value.trim();
  return displayName ? { displayName } : { problem: 'Display name is required.' };
}

// Deliberately loose: something, an @, something with a dot in it. A sign-in
// link is the real test of an address. This only catches obvious slips.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EARLIEST_BIRTH = '1900-01-01';

function personColumns(
  request: PersonFields,
  today: string,
): { columns: PersonColumns } | { problem: string } {
  const firstName = request.firstName.trim();
  const surname = request.surname.trim();
  const dateOfBirth = request.dateOfBirth.trim();

  if (!firstName || !surname || !dateOfBirth) {
    return { problem: 'First name, surname and date of birth are required.' };
  }

  const problem = dateOfBirthProblem(dateOfBirth, today);
  if (problem) return { problem };

  return {
    columns: {
      first_name: firstName,
      surname,
      date_of_birth: dateOfBirth,
      gender: request.gender.trim() || null,
      athletic_association_number: request.associationNumber.trim() || null,
    },
  };
}

// A form's date input sends YYYY-MM-DD, so plain string comparison is a date
// comparison. The round trip through Date catches a day that doesn't exist,
// such as 30 February, which the regex alone would let through.
function dateOfBirthProblem(dateOfBirth: string, today: string): string | undefined {
  const real =
    /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) &&
    new Date(`${dateOfBirth}T00:00:00Z`).toISOString().slice(0, 10) === dateOfBirth;
  if (!real) return 'Enter the date of birth as a real date.';
  if (dateOfBirth > today) return 'That date of birth is in the future. Check the year.';
  if (dateOfBirth < EARLIEST_BIRTH) return 'That date of birth is before 1900. Check the year.';
  return undefined;
}

// ── Who is a junior ─────────────────────────────────────────────────────────

/** Under this age on the day, a member is a junior. */
export const ADULT_AGE = 18;

/** Whole years old on `today`. Both dates are YYYY-MM-DD. */
export function ageOn(dateOfBirth: string, today: string): number {
  const [birthYear, birthMonthDay] = [Number(dateOfBirth.slice(0, 4)), dateOfBirth.slice(5)];
  const [year, monthDay] = [Number(today.slice(0, 4)), today.slice(5)];
  return year - birthYear - (monthDay < birthMonthDay ? 1 : 0);
}

export function isJunior(dateOfBirth: string, today: string): boolean {
  return ageOn(dateOfBirth, today) < ADULT_AGE;
}
