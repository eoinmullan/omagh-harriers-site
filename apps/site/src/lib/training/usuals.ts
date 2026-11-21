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

/**
 * The five ways to look at the night, of which exactly one is showing. They
 * used to be two sets of controls that combined, a list (Usuals, All, Guests)
 * and a filter over it (here, money collected), and a registrar could not say
 * what the combination on screen meant. One choice of five can't be misread.
 */
export type NightView = 'usuals' | 'everyone' | 'here' | 'paid' | 'guests';

/**
 * The member rows to draw for a view, which is every decision about the list
 * in one place so the screen makes none of them. Guests are a list of their
 * own, so their view draws no member rows.
 *
 * `here` and `paid` answer for the whole night, not the Usuals: somebody
 * found in Everyone and ticked counts in the headcount, so they must be on the
 * list the headcount opens.
 *
 * `term` searches the whole club: somebody typing a name has already decided
 * the Usuals do not contain who they want.
 */
export function rosterToShow(options: {
  members: RosterMember[];
  usuals: ReadonlySet<string>;
  view: NightView;
  term?: string;
  present?: ReadonlySet<string>;
  paidHouseholds?: ReadonlySet<string>;
}): RosterMember[] {
  const term = options.term?.trim() ?? '';
  const present = options.present ?? new Set<string>();
  const paidHouseholds = options.paidHouseholds ?? new Set<string>();

  const belongs: Record<NightView, (member: RosterMember) => boolean> = {
    usuals: (member) => (term ? matchesName(member, term) : options.usuals.has(member.id)),
    everyone: (member) => !term || matchesName(member, term),
    here: (member) => present.has(member.id),
    paid: (member) => paidHouseholds.has(member.principalId),
    guests: () => false,
  };

  return options.members.filter(belongs[options.view]).sort(bySurname);
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

/**
 * The balance tone in words, for a screen reader only.
 *
 * On screen the tone is carried by colour, deliberately: a line whose words
 * change with the number has to be read, not glanced at. But the colour never
 * reaches assistive technology, so the row describes itself with these words,
 * visually hidden. Nothing on screen changes.
 */
export function toneWords(tone: BalanceTone): string | undefined {
  if (tone === 'overdrawn') return 'overdrawn';
  if (tone === 'low') return "won't cover tonight";
  return undefined;
}
