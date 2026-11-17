// PROTOTYPE — throwaway. Answers "what should the registrar's attendance screen
// look like?" and nothing else. Delete once a variant has won.
//
// Groups, sessions, attendance and guests do not exist in the database yet —
// that schema is the thing this prototype exists to de-risk. So the names and
// households are real (313 active members, real sibling clusters, real surname
// spread) and everything Phase 5 would add is derived deterministically from
// the row's own uuid. Deterministic matters: every variant must show the same
// track on the same night, or they cannot be compared.

export interface PrototypePerson {
  id: string;
  firstName: string;
  surname: string;
  principalId: string;
  householdName: string;
  balancePence: number;
  group: string;
  recentAttendances: number;
}

export interface PrototypeGuest {
  id: string;
  firstName: string;
  surname: string;
}

export interface PrototypeSession {
  name: string;
  group: string;
  startsAt: string;
  location: string;
  pricePence: number;
}

export interface RegistrarPrototypeModel {
  session: PrototypeSession;
  expected: PrototypePerson[];
  everyone: PrototypePerson[];
  guests: PrototypeGuest[];
}

interface MemberSeed {
  id: string;
  first_name: string;
  surname: string;
  date_of_birth: string;
  principal_id: string;
}

function hashOf(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

const BALANCE_BANDS = [
  -400, -200, 0, 0, 100, 200, 400, 600, 1000, 1400, 1800, 2200,
] as const;

const ADULT_GROUPS = ['Endurance', 'Sprints', 'Seniors'] as const;

function ageOn(dateOfBirth: string, today: Date): number {
  const born = new Date(dateOfBirth);
  let age = today.getFullYear() - born.getFullYear();
  const beforeBirthday =
    today.getMonth() < born.getMonth() ||
    (today.getMonth() === born.getMonth() && today.getDate() < born.getDate());
  return beforeBirthday ? age - 1 : age;
}

function groupFor(member: MemberSeed, today: Date): string {
  const age = ageOn(member.date_of_birth, today);
  if (age < 13) return 'Juniors';
  if (age < 18) return 'Youth';
  return ADULT_GROUPS[hashOf(member.id) % ADULT_GROUPS.length];
}

function bySurname(a: PrototypePerson, b: PrototypePerson): number {
  return (
    a.surname.localeCompare(b.surname) || a.firstName.localeCompare(b.firstName)
  );
}

// Fictional, so that a walk-up in the prototype is obviously not a real member.
const PREVIOUS_GUESTS: PrototypeGuest[] = [
  { id: 'guest-1', firstName: 'Niamh', surname: 'Conlon' },
  { id: 'guest-2', firstName: 'Ruairí', surname: 'Daly' },
  { id: 'guest-3', firstName: 'Shannon', surname: 'Mallon' },
  { id: 'guest-4', firstName: 'Oisín', surname: 'Rafferty' },
  { id: 'guest-5', firstName: 'Beth', surname: 'Teague' },
];

const SHORTLIST_SIZE = 18;

export function buildRegistrarPrototypeModel(
  members: MemberSeed[],
  householdNames: Map<string, string>,
  today: Date,
): RegistrarPrototypeModel {
  const everyone = members
    .map((member) => ({
      id: member.id,
      firstName: member.first_name,
      surname: member.surname,
      principalId: member.principal_id,
      householdName: householdNames.get(member.principal_id) ?? 'Unknown',
      balancePence: BALANCE_BANDS[hashOf(member.principal_id) % BALANCE_BANDS.length],
      group: groupFor(member, today),
      recentAttendances: hashOf(`${member.id}:attendance`) % 11,
    }))
    .sort(bySurname);

  const group = 'Juniors';

  // Frequency decides who makes the shortlist; surname decides the order it is
  // read in. The plan currently asks for both as the ordering, which cannot be
  // true at once.
  const expected = everyone
    .filter((person) => person.group === group)
    .sort((a, b) => b.recentAttendances - a.recentAttendances || bySurname(a, b))
    .slice(0, SHORTLIST_SIZE)
    .sort(bySurname);

  return {
    session: {
      name: 'Juniors',
      group,
      startsAt: 'Tonight, 6:30pm',
      location: 'Omagh Leisure Complex',
      pricePence: 200,
    },
    expected,
    everyone,
    guests: PREVIOUS_GUESTS,
  };
}
