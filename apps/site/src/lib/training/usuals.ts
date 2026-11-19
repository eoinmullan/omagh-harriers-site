import { matchesName } from './names';

// Who the registrar actually sees, and in what order.
//
// 313 members are in the database and 10 to 20 turn up. The list that opens has
// to be the second group, without the registrar doing anything to make it so —
// and it has to be wrong gracefully, because the night it is wrong is a night
// somebody is standing in the rain waiting to be found.

export interface RosterMember {
  id: string;
  firstName: string;
  surname: string;
  principalId: string;
}

/**
 * Surname first, then first name.
 *
 * The plan once asked for attendance frequency as the ordering as well as the
 * filter, which cannot hold at once. Frequency decides who is on the list;
 * surname decides how it reads. Ordering by frequency would scatter siblings,
 * and siblings arrive together — the next person the registrar needs is usually
 * the one underneath.
 */
export function bySurname(a: RosterMember, b: RosterMember): number {
  return a.surname.localeCompare(b.surname) || a.firstName.localeCompare(b.firstName);
}

/**
 * The Usuals: who to expect at this session.
 *
 * Seeded from `member_groups`, because history alone starts empty and on the
 * first night an empty list would be worse than no feature at all. Anyone who
 * has turned up to this group before is added, which is how the list learns.
 * Anyone already ticked tonight is on it by definition — including somebody the
 * registrar went and found in the full list, which is how "the system suggests,
 * the person holding the phone decides" is expressed without a second control.
 */
export function usualsFor(sources: {
  inGroup: Iterable<string>;
  attendedBefore?: Iterable<string>;
  present?: Iterable<string>;
}): Set<string> {
  return new Set([
    ...sources.inGroup,
    ...(sources.attendedBefore ?? []),
    ...(sources.present ?? []),
  ]);
}

export type Showing = 'usuals' | 'everyone';

/**
 * The rows to draw, which is every decision about the list in one place so the
 * screen makes none of them.
 *
 * `term` searches the whole club whichever list is showing: somebody typing a
 * name has already decided the Usuals do not contain who they want, and making
 * them flip a toggle first is a tap that teaches nothing.
 */
export function rosterToShow(options: {
  members: RosterMember[];
  usuals: ReadonlySet<string>;
  showing: Showing;
  term?: string;
  presentOnly?: boolean;
  present?: ReadonlySet<string>;
}): RosterMember[] {
  const term = options.term?.trim() ?? '';
  const present = options.present ?? new Set<string>();

  return options.members
    .filter((member) => {
      // The here filter answers for the whole night. Leaving the Usuals filter
      // underneath it would make the headcount describe people the registrar
      // cannot see — somebody found in the full list and ticked would be
      // counted and then hidden.
      if (options.presentOnly) {
        return present.has(member.id) && (!term || matchesName(member, term));
      }
      if (term) return matchesName(member, term);
      if (options.showing === 'usuals') return options.usuals.has(member.id);
      return true;
    })
    .sort(bySurname);
}

// What the balance line says, and the only thing it ever says.
//
// Colour carries the warning rather than the wording: a line whose words change
// with the number is a line the registrar has to read rather than glance at.
export type BalanceTone = 'credit' | 'low' | 'overdrawn';

/**
 * Neutral in credit, amber below the price of a session, red overdrawn.
 *
 * Exactly the price is still credit — it covers tonight. Below it is the
 * warning, because the tick about to be made is the one that cannot be paid
 * for.
 */
export function balanceTone(balancePence: number, pricePence: number): BalanceTone {
  if (balancePence < 0) return 'overdrawn';
  if (balancePence < pricePence) return 'low';
  return 'credit';
}
