import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cashLabel } from '../../lib/credits/cash-label';
import { clubDayKey, formatClubDate, formatClubTime } from '../../lib/training/club-time';
import {
  cashTonight,
  householdsWhoPaid,
  moneyCollected,
  planCashChange,
  type CashRow,
} from '../../lib/training/cash';
import {
  householdsThatPaid,
  priceFor,
  rosterToShow,
  usualsFor,
  type RosterMember,
  type NightView,
} from '../../lib/training/usuals';
import { describeLostWrite, type Names } from '../../lib/training/lost-write';
import { createSupabaseBrowserClient } from '../../lib/supabase/browser';
import { moneyCaveat, syncStatus } from '../../lib/training/queue';
import { safeToRefresh, WATCH_INTERVAL_MS } from '../../lib/training/watching';
import { sessionChannel } from '../../lib/training/nudge';
import { listenForNudges } from './nudges';
import { describeSnapshotAge, loadSnapshot, saveSnapshot } from '../../lib/training/snapshot';
import type { Outbox } from './useWriteQueue';
import {
  flip,
  headcount as countHere,
  type Household,
  type NightState,
} from '../../lib/training/night';
import { guestsToShow, planNewGuest, type Guest } from '../../lib/training/guests';
import type { SelectableSession } from '../../lib/training/tonight';
import { AddGuest } from './AddGuest';
import { CashSheet } from './CashSheet';
import { GuestRow } from './GuestRow';
import { RunnerRow } from './RunnerRow';
import { PaidHouseholdRow } from './PaidHouseholdRow';
import { SyncStatus } from './SyncStatus';
import { useHistoryLayer } from './useHistoryLayer';
import { BigButton, Note, Problem, Screen } from './ui';

// The night itself: who is expected, who is here, and what each tick costs.
//
// Every decision about which rows to draw lives in `lib/training/usuals.ts`.
// What is left here is loading, the tick, and keeping the screen honest while a
// write is in flight.

interface Loaded extends NightState {
  members: RosterMember[];
  inGroup: string[];
  attendedBefore: string[];
  /** Every cash row against this session, which is what each cell reads. */
  cash: CashRow[];
  actorId: string;
  guests: Guest[];
  /** guest id → the attendance row's id, which is what an untick deletes. */
  guestsHere: Map<string, string>;
  /** What tonight's guests handed over, which never reaches the ledger. */
  guestPayments: (number | null)[];
}

type State =
  { phase: 'loading' } | { phase: 'failed'; problem: string } | { phase: 'ready'; data: Loaded };

/**
 * How long the night's data gets before the screen gives up on it.
 *
 * Not a nicety. A dead network does not always fail: the Supabase client checks
 * the session before every request and, when a token refresh cannot complete,
 * waits on its own lock rather than erroring. The request never settles, so
 * nothing throws, nothing returns, and the screen sits on "Getting tonight's
 * list…" until somebody gives up — at a track, in the rain.
 *
 * A registrar would rather see last night's list in eight seconds than a
 * perfect one never.
 */
const LOAD_DEADLINE_MS = 8_000;

function within<T>(ms: number, work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timed out waiting for the network.')), ms),
    ),
  ]);
}

/** One per session, so last Monday's list is never mistaken for tonight's. */
function snapshotKey(sessionId: string): string {
  return `night:${sessionId}`;
}

export function AttendanceView({
  authUserId,
  outbox,
  session,
  onBack,
}: {
  /** Passed in rather than fetched — see the note in `load`. */
  authUserId: string;
  /** The phone's one outbox, mounted at the island root. */
  outbox: Outbox;
  session: SelectableSession;
  onBack?: () => void;
}) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [view, setView] = useState<NightView>('usuals');
  const [term, setTerm] = useState('');
  const [cashFor, setCashFor] = useState<RosterMember | undefined>();
  // The cash sheet is a layer the back gesture closes, rather than leaving the
  // session from underneath it.
  const closeSheet = useHistoryLayer('registrarSheet', cashFor !== undefined, () => setCashFor(undefined));
  const [guestProblem, setGuestProblem] = useState<string | null>(null);
  const [showingSnapshotFrom, setShowingSnapshotFrom] = useState<number | null>(null);

  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ phase: 'loading' });

    try {
      const supabase = createSupabaseBrowserClient();

      const [members, balances, groupRows, attendanceRows, historyRows, cashRows, guestRows] =
        await within(
          LOAD_DEADLINE_MS,
          Promise.all([
            supabase
              .from('members')
              .select('id, first_name, surname, principal_id, trains_free, principal:principal_id(display_name)')
              .eq('is_active', true),
            supabase.from('principal_balances').select('principal_id, balance_pence'),
            supabase.from('member_groups').select('member_id').eq('group_id', session.groupId),
            supabase
              .from('attendance')
              .select('id, member_id, guest_id, amount_paid_pence')
              .eq('session_id', session.id),
            // Who has turned up to this squad before, which is how the Usuals
            // learn. Each of them once (migration 0020), so the answer is sized by
            // the membership rather than the history. Fetching the raw attendance
            // used to run past PostgREST's 1000-row limit within a season, and
            // the list then learned from whatever happened to come back.
            supabase
              .from('squad_regulars')
              .select('member_id')
              .eq('group_id', session.groupId),
            supabase
              .from('credit_transactions')
              .select('principal_id, type, amount_pence')
              .eq('session_id', session.id),
            supabase.from('guests').select('id, first_name, surname'),
          ]),
        );

      const failure = [members, balances, groupRows, attendanceRows, historyRows, cashRows].find(
        (result) => result.error,
      );
      if (failure?.error) {
        // No signal, most likely. The shell opened from the cache; put back what
        // this phone last believed rather than an error and an empty list.
        const stored = await loadSnapshot<Loaded>(snapshotKey(session.id));
        if (stored) {
          setShowingSnapshotFrom(stored.savedAt);
          setState({ phase: 'ready', data: stored.data });
          return;
        }

        setState({ phase: 'failed', problem: failure.error.message });
        return;
      }

      setShowingSnapshotFrom(null);

      type MemberRow = {
        id: string;
        first_name: string;
        surname: string;
        principal_id: string;
        trains_free: boolean;
        principal: { display_name: string } | null;
      };

      const households = new Map<string, Household>();
      const balanceOf = new Map<string, number>();
      for (const row of (balances.data ?? []) as {
        principal_id: string;
        balance_pence: number;
      }[]) {
        balanceOf.set(row.principal_id, row.balance_pence);
      }

      const roster: RosterMember[] = [];
      for (const row of (members.data ?? []) satisfies MemberRow[]) {
        roster.push({
          id: row.id,
          firstName: row.first_name,
          surname: row.surname,
          principalId: row.principal_id,
          trainsFree: row.trains_free,
        });
        if (!households.has(row.principal_id)) {
          households.set(row.principal_id, {
            name: row.principal?.display_name ?? 'Household',
            balancePence: balanceOf.get(row.principal_id) ?? 0,
          });
        }
      }

      const here = new Map<string, string>();
      const guestsHere = new Map<string, string>();
      const guestPayments: (number | null)[] = [];
      for (const row of (attendanceRows.data ?? []) as {
        id: string;
        member_id: string | null;
        guest_id: string | null;
        amount_paid_pence: number | null;
      }[]) {
        if (row.member_id) here.set(row.member_id, row.id);
        if (row.guest_id) {
          guestsHere.set(row.guest_id, row.id);
          guestPayments.push(row.amount_paid_pence);
        }
      }

      const attendedBefore = ((historyRows.data ?? []) as { member_id: string | null }[])
        .map((row) => row.member_id)
        .filter((id): id is string => id !== null);

      // Whose principal row records the cash, which is how the night is later
      // split by who took it.
      // No auth call anywhere in this function. The auth client refreshes an
      // expired token over the network and, when that network is dead, hangs on
      // its own lock rather than failing — which leaves this screen on "Getting
      // tonight's list…" for ever instead of falling back to the snapshot.
      const actor =
        (
          await supabase
            .from('principals')
            .select('id')
            .eq('auth_user_id', authUserId)
            .maybeSingle()
        ).data?.id ?? '';

      setState({
        phase: 'ready',
        data: {
          cash: (cashRows.data ?? []).map((row): CashRow => ({
            principalId: row.principal_id,
            type: row.type,
            amountPence: row.amount_pence,
          })),
          actorId: actor,
          guests: (
            (guestRows.data ?? []) as {
              id: string;
              first_name: string;
              surname: string;
            }[]
          ).map((row): Guest => ({
            id: row.id,
            firstName: row.first_name,
            surname: row.surname,
          })),
          guestsHere,
          guestPayments,
          members: roster,
          households,
          inGroup: ((groupRows.data ?? []) as { member_id: string }[]).map((r) => r.member_id),
          attendedBefore,
          here,
        },
      });
    } catch {
      // Supabase throws rather than returns when the request never
      // leaves the phone, and an uncaught throw here leaves the screen on
      // "Getting the list…" for ever — which is precisely the
      // moment this cache exists for.
      const stored = await loadSnapshot<Loaded>(snapshotKey(session.id));
      console.log(stored ? 'found' : 'MISSING', snapshotKey(session.id));
      if (stored) {
        setShowingSnapshotFrom(stored.savedAt);
        setState({ phase: 'ready', data: stored.data });
        return;
      }
      setState({
        phase: 'failed',
        problem: 'No signal, and nothing saved for this session yet.',
      });
    }
  }, [session.id, session.groupId, authUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the snapshot level with the screen. Every optimistic change counts:
  // the registrar who closes the app and opens it again two minutes later must
  // see what they left, not what the network last confirmed.
  useEffect(() => {
    if (state.phase !== 'ready') return;

    const data = state.data;
    const save = setTimeout(() => void saveSnapshot(snapshotKey(session.id), data), 400);
    return () => clearTimeout(save);
  }, [state, session.id]);

  // Only on the edge from offline to online, never merely because we are
  // online. navigator.onLine says the phone has a network, not that requests
  // reach Supabase — a leisure centre's captive portal is online by that
  // measure. Reloading on the steady state turns a failing network into a loop:
  // show the snapshot, reload, fail, show the snapshot, for ever, with the
  // screen stuck on "Getting the list…" the whole time.
  const wasOffline = useRef(false);
  useEffect(() => {
    const cameBack = wasOffline.current && outbox.online;
    wasOffline.current = !outbox.online;
    if (cameBack) void load();
  }, [outbox.online, load]);

  // What the other phone can have changed, and nothing else. The member list,
  // the squads and the guest list do not move during a session, so re-fetching
  // 314 names on every catch-up would be paying for nothing.
  const catchUpOnTheOtherPhone = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();

    try {
      const [attendanceRows, cashRows, balances] = await Promise.all([
        supabase
          .from('attendance')
          .select('id, member_id, guest_id, amount_paid_pence')
          .eq('session_id', session.id),
        supabase
          .from('credit_transactions')
          .select('principal_id, type, amount_pence')
          .eq('session_id', session.id),
        supabase.from('principal_balances').select('principal_id, balance_pence'),
      ]);

      if (attendanceRows.error || cashRows.error || balances.error) return;

      setState((current) => {
        if (current.phase !== 'ready') return current;

        const here = new Map<string, string>();
        const guestsHere = new Map<string, string>();
        const guestPayments: (number | null)[] = [];
        for (const row of attendanceRows.data ?? []) {
          if (row.member_id) here.set(row.member_id, row.id);
          if (row.guest_id) {
            guestsHere.set(row.guest_id, row.id);
            guestPayments.push(row.amount_paid_pence);
          }
        }

        const households = new Map(current.data.households);
        for (const row of balances.data ?? []) {
          const household = households.get(row.principal_id);
          if (household) {
            households.set(row.principal_id, { ...household, balancePence: row.balance_pence });
          }
        }

        return {
          phase: 'ready',
          data: {
            ...current.data,
            here,
            guestsHere,
            guestPayments,
            households,
            cash: (cashRows.data ?? []).map((row): CashRow => ({
              principalId: row.principal_id,
              type: row.type,
              amountPence: row.amount_pence,
            })),
          },
        };
      });
    } catch {
      // A failed catch-up is not worth saying anything about: the screen is
      // still the registrar's own view, and the next nudge or poll will try again.
    }
  }, [session.id]);

  // The other phone says something changed in this session (nudge.ts). That
  // only marks the screen as owing a catch-up; the effect below decides when,
  // by the same rule as the poll, so a nudge that arrives mid-tap waits for
  // this phone's own writes to land.
  const owesCatchUp = useRef(false);
  const [nudges, setNudges] = useState(0);
  useEffect(
    () =>
      listenForNudges(createSupabaseBrowserClient(), sessionChannel(session.id), () => {
        owesCatchUp.current = true;
        setNudges((count) => count + 1);
      }),
    [session.id],
  );

  useEffect(() => {
    if (state.phase !== 'ready' || showingSnapshotFrom !== null) return;

    const look = () => {
      const conditions = {
        online: outbox.online,
        pending: outbox.pending,
        busy: cashFor !== undefined,
        visible: typeof document === 'undefined' || document.visibilityState === 'visible',
      };
      if (!safeToRefresh(conditions)) return;
      owesCatchUp.current = false;
      void catchUpOnTheOtherPhone();
    };

    // Runs again whenever anything in the rule changes, so a nudge that had to
    // wait is honoured the moment it's safe.
    if (owesCatchUp.current) look();

    const ticking = setInterval(look, WATCH_INTERVAL_MS);
    // Coming back to the app is the moment most likely to be out of date.
    document.addEventListener('visibilitychange', look);
    return () => {
      clearInterval(ticking);
      document.removeEventListener('visibilitychange', look);
    };
  }, [
    state.phase,
    showingSnapshotFrom,
    outbox.online,
    outbox.pending,
    cashFor,
    catchUpOnTheOtherPhone,
    nudges,
  ]);

  // A queue restored from storage lands after this screen has already loaded,
  // so the database has moved and the screen has no way to know. Reloading on
  // every tap would be a round trip per tick; reloading when the backlog clears
  // is one round trip per opening of the app.
  useEffect(() => {
    if (outbox.caughtUp === 0) return;
    void load();
  }, [outbox.caughtUp, load]);

  // A refusal means this screen believes something the database doesn't, so
  // reload. Keyed on the count, so every new refusal reloads (the old string
  // key missed a second refusal with the same text) and dismissing doesn't.
  useEffect(() => {
    if (outbox.refused.length === 0) return;
    void load();
  }, [outbox.refused.length, load]);

  const data = state.phase === 'ready' ? state.data : undefined;

  const usuals = useMemo(
    () =>
      usualsFor({
        inGroup: data?.inGroup ?? [],
        attendedBefore: data?.attendedBefore ?? [],
        present: data ? [...data.here.keys()] : [],
      }),
    [data],
  );

  const present = useMemo(() => new Set(data ? data.here.keys() : []), [data]);

  // The Paid view, by household, so its rows add up to the header's figure.
  const paidByHousehold = useMemo(
    () =>
      data
        ? householdsThatPaid({
            members: data.members,
            present,
            cashFor: (principalId) => cashTonight(data.cash, principalId),
            nameOf: (principalId) => data.households.get(principalId)?.name ?? 'A household',
          })
        : [],
    [data, present],
  );

  const paidHouseholds = useMemo(
    () => (data ? householdsWhoPaid(data.cash) : new Set<string>()),
    [data],
  );

  const rows = useMemo(() => {
    if (!data) return [];

    return rosterToShow({
      members: data.members,
      usuals,
      view,
      term,
      present,
      paidHouseholds,
    });
  }, [data, usuals, view, term, present, paidHouseholds]);

  // One write per tap. The queue that coalesces a mis-tap before it reaches the
  // database belongs with the offline work; until then the RPC's idempotency is
  // what keeps a double tap honest, and an untick is a real reversal.
  //
  // Every state change here is a pure transition from `lib/training/night.ts`,
  // which is where the promise the screen makes — the row flips and the pot
  // moves before the write lands — is taken back if the write fails.
  function toggle(member: RosterMember) {
    if (!data) return;

    const existing = data.here.get(member.id);
    const wasHere = existing !== undefined;

    // Minted here, so the untick has a row to name before the tick has landed.
    const attendanceId = wasHere ? existing : crypto.randomUUID();

    const tap = {
      memberId: member.id,
      principalId: member.principalId,
      wasHere,
      pricePence: priceFor(member, session.pricePence),
    };

    setProblem(null);
    setState((current) =>
      current.phase === 'ready'
        ? {
            phase: 'ready',
            data: {
              ...current.data,
              ...flip(current.data, { ...tap, attendanceId }),
            },
          }
        : current,
    );

    outbox.add(
      wasHere
        ? { kind: 'undo_sign_in', attendanceId, memberId: member.id, sessionId: session.id }
        : {
            kind: 'sign_in',
            memberId: member.id,
            sessionId: session.id,
            attendanceId,
          },
    );
  }

  // Cash is a household fact, so the row that is written names the principal and
  // leaves member_id null. What changes is the difference between the figure on
  // screen and the one the registrar asked for — a top-up going up, a refund
  // coming down, never a negative top-up.
  // Cash is a household fact, so the row names the principal and leaves
  // member_id null. What is written is the difference between the figure on
  // screen and the one the registrar asked for — a top-up going up, a refund
  // coming down, never a negative top-up.
  function saveCash(member: RosterMember, targetPence: number) {
    if (!data) return;

    const row = planCashChange({
      currentPence: cashTonight(data.cash, member.principalId),
      targetPence,
      principalId: member.principalId,
      sessionId: session.id,
      recordedBy: data.actorId,
      clientId: crypto.randomUUID(),
    });

    closeSheet();
    if (!row) return;

    setProblem(null);
    setState((current) => {
      if (current.phase !== 'ready') return current;

      const households = new Map(current.data.households);
      const household = households.get(member.principalId);
      if (household) {
        households.set(member.principalId, {
          ...household,
          balancePence: household.balancePence + row.amount_pence,
        });
      }

      return {
        phase: 'ready',
        data: {
          ...current.data,
          households,
          cash: [
            ...current.data.cash,
            {
              principalId: member.principalId,
              type: row.type,
              amountPence: row.amount_pence,
            },
          ],
        },
      };
    });

    outbox.add({ kind: 'cash', row });
  }

  function toggleGuest(guest: Guest) {
    if (!data) return;

    const wasHere = data.guestsHere.has(guest.id);
    const paid = session.pricePence > 0 ? session.pricePence : null;
    const attendanceId = wasHere ? data.guestsHere.get(guest.id) : crypto.randomUUID();

    setProblem(null);
    setState((current) => {
      if (current.phase !== 'ready') return current;
      const guestsHere = new Map(current.data.guestsHere);
      if (wasHere) guestsHere.delete(guest.id);
      else if (attendanceId) guestsHere.set(guest.id, attendanceId);

      const guestPayments = wasHere
        ? removeOne(current.data.guestPayments, paid)
        : [...current.data.guestPayments, paid];

      return {
        phase: 'ready',
        data: { ...current.data, guestsHere, guestPayments },
      };
    });

    outbox.add(
      wasHere
        ? { kind: 'guest_undo', guestId: guest.id, sessionId: session.id, attendanceId }
        : {
            kind: 'guest_sign_in',
            guestId: guest.id,
            sessionId: session.id,
            attendanceId,
            pricePence: session.pricePence,
            recordedBy: data.actorId,
          },
    );
  }

  // Adding a guest is the one write that cannot be queued: the rest of the
  // night needs the id Postgres gives back before anything can reference it.
  // Offline, the registrar is told to take the name down on paper rather than
  // handed a row that will never exist.
  async function addGuest(firstName: string, surname: string) {
    if (!data) return;

    const plan = planNewGuest({ firstName, surname, createdBy: data.actorId });
    if ('problem' in plan) {
      setGuestProblem(plan.problem);
      return;
    }

    setGuestProblem(null);
    const { data: created, error } = await createSupabaseBrowserClient()
      .from('guests')
      .insert(plan.insert)
      .select('id, first_name, surname')
      .single();

    if (error || !created) {
      setGuestProblem(
        outbox.online
          ? (error?.message ?? 'Could not add that guest.')
          : 'Offline — a new guest cannot be added until the signal is back. Take the name on paper.',
      );
      return;
    }

    const guest: Guest = {
      id: created.id,
      firstName: created.first_name,
      surname: created.surname,
    };

    setState((current) =>
      current.phase === 'ready'
        ? {
            phase: 'ready',
            data: { ...current.data, guests: [...current.data.guests, guest] },
          }
        : current,
    );

    // Somebody added at the track is standing in front of the registrar, so
    // sign them straight in rather than making them find the new row.
    toggleGuest(guest);
  }

  if (state.phase === 'loading') {
    return (
      <Screen title={session.groupName}>
        <p className="text-lg text-neutral-400">Getting the list…</p>
      </Screen>
    );
  }

  if (state.phase === 'failed') {
    return (
      <Screen title={session.groupName}>
        <Problem>Couldn't load the list. {state.problem}</Problem>
        <BigButton onClick={() => void load()}>Try again</BigButton>
      </Screen>
    );
  }

  const headcount = countHere(data!) + data!.guestsHere.size;
  const collected = moneyCollected(data!.cash, data!.guestPayments);
  const guestRows = guestsToShow(data!.guests, term);
  const paidGuests =
    session.pricePence > 0 ? guestsToShow(data!.guests, '').filter((guest) => data!.guestsHere.has(guest.id)) : [];
  const caveat = moneyCaveat({
    pending: outbox.pending,
    online: outbox.online,
  });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col">
      <header className="sticky top-0 z-20 border-b border-neutral-800 bg-black">
        <div className="flex items-start gap-3 px-4 pt-3 pb-2">
          {/* The way back, always in reach. An app on an iPhone's home screen
              has no back button, and a Done at the foot of the list is under
              313 names on Everyone. Done is there too, for the end of a short
              list. */}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to the session list"
              className="-ml-3 flex size-11 shrink-0 items-center justify-center rounded-full text-3xl leading-none text-neutral-300 active:bg-neutral-800"
            >
              <span aria-hidden="true">‹</span>
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{session.groupName}</h1>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-neutral-400">
                {/* A night reopened from Past sessions says which night it was. */}
                {clubDayKey(session.startsAt) === clubDayKey(new Date())
                  ? formatClubTime(session.startsAt)
                  : `${formatClubDate(session.startsAt)}, ${formatClubTime(session.startsAt)}`}
              </p>
              <SyncStatus status={syncStatus({ pending: outbox.pending, online: outbox.online })} />
            </div>
          </div>
        </div>

        {/* One choice of five. The night's two figures are views like the
            rest: tapping the headcount lists who is signed in, tapping the money
            lists the households that paid. Nothing combines, so what is on
            screen is always exactly what the highlighted button says. */}
        <div role="radiogroup" aria-label="Show" className="grid grid-cols-6 gap-1 p-2">
          {(
            [
              // Each figure is about tonight. Everyone's would be the size of
              // the club, which says nothing at the gate, so it shows what the
              // view is for instead; Guests counts tonight's, not every guest
              // on file.
              ['usuals', 'Usuals', String(usuals.size)],
              ['everyone', 'Everyone', <SearchIcon />],
              ['guests', 'Guests', String(data!.guestsHere.size)],
            ] as const
          ).map(([option, label, count]) => (
            <ViewChoice
              key={option}
              label={label}
              figure={count}
              chosen={view === option}
              className="col-span-2"
              onChoose={() => {
                setView(option);
                setTerm('');
              }}
            />
          ))}
          <ViewChoice
            label="Signed in"
            figure={String(headcount)}
            large
            chosen={view === 'here'}
            className="col-span-3"
            onChoose={() => {
              setView('here');
              setTerm('');
            }}
          />
          <ViewChoice
            label="Paid"
            figure={cashLabel(collected)}
            large
            accent
            chosen={view === 'paid'}
            className="col-span-3"
            onChoose={() => {
              setView('paid');
              setTerm('');
            }}
          />
        </div>

        {/* Only on Everyone. The Usuals are short enough to read, and the
            other views have already narrowed the night to an answer. */}
        {view === 'everyone' && (
          <div className="px-2 pb-2">
            <input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Type any part of a name"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              aria-label="Find a runner"
              className="w-full rounded-xl bg-neutral-900 px-4 py-4 text-lg outline-none placeholder-neutral-400 focus:ring-2 focus:ring-amber"
            />
          </div>
        )}
      </header>

      <div className="px-4 pt-3">
        {showingSnapshotFrom !== null && (
          <p className="mb-3 rounded-xl bg-amber/10 px-4 py-2 text-sm text-amber" role="status">
            {describeSnapshotAge(showingSnapshotFrom)} Ticks and cash are being kept and will send
            when the signal is back.
          </p>
        )}

        {/* Offline only. Writes still sending online are the sync status's
            job, in its fixed place in the header. */}
        {caveat && (
          <p className="mb-3 text-sm text-amber" role="status">
            {caveat}
          </p>
        )}

        {outbox.refused.length > 0 && (
          <div className="mb-3 space-y-2">
            {outbox.refused.map((refusal) => (
              <Problem key={refusal.id}>
                <span className="block font-semibold">
                  {describeLostWrite(refusal.write, namesFrom(data))}
                </span>
                <span className="mt-1 block text-sm text-red-300/80">{refusal.reason}</span>
              </Problem>
            ))}
            <BigButton tone="quiet" onClick={outbox.dismissRefusals}>
              {outbox.refused.length === 1 ? 'Got it' : `Got all ${outbox.refused.length}`}
            </BigButton>
          </div>
        )}

        {problem && (
          <div className="mb-3">
            <Problem>{problem}</Problem>
          </div>
        )}

        {view === 'guests' ? (
          <div className="pb-6">
            <ul className="-mx-4">
              {guestRows.map((guest) => (
                <GuestRow
                  key={guest.id}
                  guest={guest}
                  pricePence={session.pricePence}
                  isHere={data!.guestsHere.has(guest.id)}
                    onToggle={() => toggleGuest(guest)}
                />
              ))}
            </ul>
            {guestRows.length === 0 && (
              <Note>
                {term
                  ? `No guest matches "${term}".`
                  : 'No guests on file yet. Add one below and they are signed in straight away.'}
              </Note>
            )}
            <AddGuest
              guests={data!.guests}
              onPick={(guest) => void toggleGuest(guest)}
              onAdd={(firstName, surname) => void addGuest(firstName, surname)}
              problem={guestProblem}
            />
          </div>
        ) : view === 'paid' && (paidByHousehold.length > 0 || paidGuests.length > 0) ? (
          <ul className="-mx-4 pb-6">
            {paidByHousehold.map((household) => (
              <PaidHouseholdRow
                key={household.principalId}
                household={household}
                onCash={() => setCashFor(household.anyMember)}
              />
            ))}
            {/* A guest's money is on their own sign-in, so each is a row of
                their own, and the rows still add up to the header. */}
            {paidGuests.map((guest) => (
              <li key={guest.id} className="flex items-stretch border-b border-neutral-800">
                <div className="flex min-h-[76px] min-w-0 flex-1 flex-col justify-center px-4 py-3">
                  <span className="block truncate text-lg leading-tight">
                    <span className="font-bold tracking-wide uppercase">{guest.surname}</span>, {guest.firstName}
                  </span>
                  <span className="block text-sm text-neutral-400">Guest</span>
                </div>
                <div className="flex w-[72px] shrink-0 flex-col items-center justify-center border-l border-neutral-800 leading-none">
                  <span className="text-base font-bold text-amber">{cashLabel(session.pricePence)}</span>
                  <span className="mt-1 block text-[11px] tracking-wider text-neutral-400 uppercase">paid</span>
                </div>
              </li>
            ))}
          </ul>
        ) : view !== 'paid' && rows.length > 0 ? (
          <ul className="-mx-4 pb-6">
            {rows.map((member) => (
              <RunnerRow
                key={member.id}
                member={member}
                household={data!.households.get(member.principalId)}
                pricePence={session.pricePence}
                cashPence={cashTonight(data!.cash, member.principalId)}
                isHere={present.has(member.id)}
                onToggle={() => toggle(member)}
                onCash={() => setCashFor(member)}
              />
            ))}
          </ul>
        ) : (
          <div className="py-6">
            <Note>
              {view === 'here'
                ? 'Nobody is signed in yet.'
                : view === 'paid'
                  ? 'Nobody has handed anything over yet.'
                  : term
                    ? `Nobody matches "${term}". Guests are not in this list yet.`
                    : 'Nobody is on this session’s list yet. Try Everyone, or assign the squad on the website.'}
            </Note>
          </div>
        )}

        {cashFor && (
          <CashSheet
            householdName={data!.households.get(cashFor.principalId)?.name ?? 'This household'}
            memberNames={data!.members
              .filter((candidate) => candidate.principalId === cashFor.principalId)
              .map((candidate) => `${candidate.firstName} ${candidate.surname}`)}
            currentPence={cashTonight(data!.cash, cashFor.principalId)}
            onSave={(target) => void saveCash(cashFor, target)}
            onClose={closeSheet}
          />
        )}
      </div>

      {onBack && (
        <div className="mt-auto px-4 pt-4 pb-6">
          <BigButton tone="quiet" onClick={onBack}>
            Done
          </BigButton>
        </div>
      )}
    </div>
  );
}

/** Drops one matching payment, so an untick takes exactly its own money back. */
function removeOne(payments: (number | null)[], pence: number | null): (number | null)[] {
  const at = payments.indexOf(pence);
  return at === -1 ? payments : [...payments.slice(0, at), ...payments.slice(at + 1)];
}

/** A figure in the header, and the names behind it, as one control. */
function ViewChoice({
  label,
  figure,
  chosen,
  large,
  accent,
  className,
  onChoose,
}: {
  label: string;
  figure: ReactNode;
  chosen: boolean;
  large?: boolean;
  accent?: boolean;
  className: string;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      onClick={onChoose}
      className={`${className} rounded-lg px-1 ${large ? 'py-2' : 'py-2.5'} ${
        chosen ? 'bg-neutral-100 text-black' : 'bg-neutral-900 text-neutral-300'
      }`}
    >
      <span
        className={`block font-bold ${large ? 'text-2xl' : 'text-base'} ${
          !chosen && accent ? 'text-amber' : !chosen ? 'text-white' : ''
        }`}
      >
        {figure}
      </span>
      <span className={`block text-xs font-semibold tracking-wide uppercase ${chosen ? 'text-black/70' : 'text-neutral-400'}`}>
        {label}
      </span>
    </button>
  );
}

/** Everyone's figure: the view is for finding anybody, so it says so. */
function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
      className="mx-auto my-[3px]"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}

// Names for a refused write, from whatever this screen has loaded. The roster
// and guest list are the whole club, so a refusal for another session's write
// still finds its people. Anything missing falls back to a plain description.
function namesFrom(data: Loaded | undefined): Names {
  return {
    member: (id) => {
      const member = data?.members.find((candidate) => candidate.id === id);
      return member ? `${member.firstName} ${member.surname}` : undefined;
    },
    household: (id) => data?.households.get(id)?.name,
    guest: (id) => {
      const guest = data?.guests.find((candidate) => candidate.id === id);
      return guest ? `${guest.firstName} ${guest.surname}` : undefined;
    },
  };
}
