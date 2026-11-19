// What the screen believes about tonight, and how a tap changes it.
//
// A tick has to feel instant with a queue of runners waiting, so the row flips
// and the household balance moves before the write has landed. That optimism is
// a promise the screen makes on the database's behalf, and it has to be taken
// back exactly when the write fails — which is why these are three pure
// functions rather than three setState callbacks buried in a component.

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

/**
 * The id a row carries between the tap and the write landing. It is never sent
 * anywhere: `settle` swaps it for the real one, and an untick is refused while
 * it is still in place.
 */
export const PENDING = 'pending';

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
 * only a promise sitting in the write queue.
 */
export function flip(state: NightState, tap: Tap & { attendanceId?: string }): NightState {
  const here = new Map(state.here);
  if (tap.wasHere) here.delete(tap.memberId);
  else here.set(tap.memberId, tap.attendanceId ?? PENDING);

  return { here, households: moveBalance(state.households, tap, tap.wasHere ? 1 : -1) };
}

/**
 * The write failed, so take the promise back — including the attendance id an
 * untick needs, which `flip` dropped on the floor.
 */
export function restore(state: NightState, tap: Tap & { attendanceId?: string }): NightState {
  const here = new Map(state.here);
  if (tap.wasHere && tap.attendanceId) here.set(tap.memberId, tap.attendanceId);
  else here.delete(tap.memberId);

  return { here, households: moveBalance(state.households, tap, tap.wasHere ? -1 : 1) };
}

/**
 * The write landed. The balance has already moved; all that is left is to put
 * the real attendance id where the placeholder was, so the row can be unticked.
 */
export function settle(state: NightState, settled: { memberId: string; attendanceId: string }): NightState {
  if (!state.here.has(settled.memberId)) return state;

  const here = new Map(state.here);
  here.set(settled.memberId, settled.attendanceId);
  return { ...state, here };
}

/** A row whose write has not landed yet cannot be unticked — there is no id to undo. */
export function isSettled(state: NightState, memberId: string): boolean {
  const attendanceId = state.here.get(memberId);
  return attendanceId !== undefined && attendanceId !== PENDING;
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
