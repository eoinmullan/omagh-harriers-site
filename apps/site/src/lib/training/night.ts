// What the screen believes about tonight, and how a tap changes it.
//
// A tick has to feel instant with a queue of runners waiting, so the row flips
// and the household balance moves the moment the finger comes off the screen.
//
// There is no rollback here any more. The outbox retries a dropped connection
// for as long as it takes and reloads the list outright if Postgres refuses,
// so there is no state to unpick by hand — which is a better answer than the
// one this module used to hold.

export interface Household {
  name: string;
  balancePence: number;
}

export interface NightState {
  /** principal id → the household's pot, as the screen currently believes it. */
  households: ReadonlyMap<string, Household>;
  /** member id → the attendance row's id, which is what an untick is keyed off. */
  here: ReadonlyMap<string, string>;
}

interface Tap {
  memberId: string;
  principalId: string;
  wasHere: boolean;
  pricePence: number;
}

/**
 * The tap, applied at once: the row flips and the pot moves with it.
 *
 * `attendanceId` is minted by the caller at tick time rather than by Postgres,
 * which is what lets an untick name the row it reverses while that row is still
 * only a promise sitting in the outbox.
 */
export function flip(state: NightState, tap: Tap & { attendanceId: string }): NightState {
  const here = new Map(state.here);
  if (tap.wasHere) here.delete(tap.memberId);
  else here.set(tap.memberId, tap.attendanceId);

  return { here, households: moveBalance(state.households, tap, tap.wasHere ? 1 : -1) };
}

export function headcount(state: NightState): number {
  return state.here.size;
}

function moveBalance(
  households: ReadonlyMap<string, Household>,
  tap: Tap,
  direction: 1 | -1,
): ReadonlyMap<string, Household> {
  const household = households.get(tap.principalId);
  if (!household || tap.pricePence === 0) return households;

  const next = new Map(households);
  next.set(tap.principalId, {
    ...household,
    balancePence: household.balancePence + direction * tap.pricePence,
  });
  return next;
}
