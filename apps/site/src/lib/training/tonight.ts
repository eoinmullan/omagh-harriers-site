import { clubDayKey, parseClubDateTime } from './club-time';

// Which session the registrar is being offered, decided here so the screen
// decides nothing.

export interface SelectableSession {
  id: string;
  name: string;
  startsAt: string;
  location: string | null;
  pricePence: number;
  isCancelled: boolean;
  groupId: string;
  groupName: string;
}

export interface TonightsSessions {
  /** What can be signed into, soonest first. */
  available: SelectableSession[];
  /** Called off, but still worth naming — see below. */
  cancelled: SelectableSession[];
}

/**
 * Tonight is Omagh's calendar day, not the Worker's. A session at 20:30 in June
 * is 19:30Z and one that starts at midnight is tomorrow in UTC while everybody
 * involved still calls it tonight.
 *
 * Cancelled sessions come back separately rather than being dropped. "No
 * sessions tonight" and "Monday Track was called off" send a registrar standing
 * in the rain to two different places, and only one of them is the truth.
 */
export function tonightsSessions(
  sessions: SelectableSession[],
  now: Date = new Date(),
): TonightsSessions {
  const today = clubDayKey(now);
  const tonight = sessions
    .filter((session) => clubDayKey(session.startsAt) === today)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  return {
    available: tonight.filter((session) => !session.isCancelled),
    cancelled: tonight.filter((session) => session.isCancelled),
  };
}

/**
 * The one session to open straight away, if there is exactly one.
 *
 * Most nights there is a single session and a list of one is a tap that asks
 * nothing. Two or more and the registrar has to choose, because picking for
 * them would put the night's attendance against the wrong group.
 */
export function theOnlyChoice(tonight: TonightsSessions): SelectableSession | undefined {
  return tonight.available.length === 1 ? tonight.available[0] : undefined;
}

/**
 * The instants bounding Omagh's today, so the query asks for one evening rather
 * than the whole table and then throws most of it away. A registrar on leisure
 * centre wifi notices the difference.
 *
 * The next day is worked out by UTC calendar arithmetic on the day *number*,
 * not by adding 24 hours to an instant — on the two nights a year the clocks
 * move, 24 hours lands on the wrong day. The boundaries themselves are then
 * read back through Omagh's clock, which is where the offset gets applied.
 */
export function clubDayWindow(now: Date = new Date()): { from: string; until: string } {
  const today = clubDayKey(now);
  const [year, month, day] = today.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(year!, month! - 1, day! + 1));
  const nextKey = tomorrow.toISOString().slice(0, 10);

  const from = parseClubDateTime(`${today}T00:00`);
  const until = parseClubDateTime(`${nextKey}T00:00`);

  // Both keys are generated above and always well formed; the fallback keeps
  // the signature honest rather than guarding against a real case.
  return { from: from ?? now.toISOString(), until: until ?? now.toISOString() };
}
