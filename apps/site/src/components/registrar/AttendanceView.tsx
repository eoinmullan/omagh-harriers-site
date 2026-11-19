import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatPounds } from '../../lib/credits/money';
import { formatClubTime } from '../../lib/training/club-time';
import {
  cashTonight,
  householdsWhoPaid,
  moneyCollected,
  planCashChange,
  type CashRow,
} from '../../lib/training/cash';
import {
  rosterToShow,
  usualsFor,
  type RosterMember,
  type Showing,
} from '../../lib/training/usuals';
import { createSupabaseBrowserClient } from '../../lib/supabase/browser';
import {
  flip,
  headcount as countHere,
  isSettled,
  restore,
  settle,
  type Household,
  type NightState,
} from '../../lib/training/night';
import type { SelectableSession } from '../../lib/training/tonight';
import { CashSheet } from './CashSheet';
import { RunnerRow } from './RunnerRow';
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
}

type State =
  | { phase: 'loading' }
  | { phase: 'failed'; problem: string }
  | { phase: 'ready'; data: Loaded };

export function AttendanceView({
  session,
  onBack,
}: {
  session: SelectableSession;
  onBack?: () => void;
}) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [showing, setShowing] = useState<Showing>('usuals');
  const [term, setTerm] = useState('');
  const [hereOnly, setHereOnly] = useState(false);
  const [paidOnly, setPaidOnly] = useState(false);
  const [cashFor, setCashFor] = useState<RosterMember | undefined>();
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    const supabase = createSupabaseBrowserClient();

    const [members, balances, groupRows, attendanceRows, historyRows, cashRows, me] =
      await Promise.all([
      supabase
        .from('members')
        .select('id, first_name, surname, principal_id, principal:principal_id(display_name)')
        .eq('is_active', true),
      supabase.from('principal_balances').select('principal_id, balance_pence'),
      supabase.from('member_groups').select('member_id').eq('group_id', session.groupId),
      supabase.from('attendance').select('id, member_id').eq('session_id', session.id),
      // Who has turned up to this group before, which is how the Usuals learn.
      // The group filter is an inner join on the embed so the database does the
      // narrowing — otherwise this is every attendance row the club has ever
      // recorded, fetched to a phone, to answer a question about one squad.
      supabase
        .from('attendance')
        .select('member_id, session:session_id!inner(group_id)')
        .eq('session.group_id', session.groupId)
        .not('member_id', 'is', null),
      supabase
        .from('credit_transactions')
        .select('principal_id, type, amount_pence')
        .eq('session_id', session.id),
      supabase.auth.getUser(),
    ]);

    const failure = [members, balances, groupRows, attendanceRows, historyRows, cashRows].find(
      (result) => result.error,
    );
    if (failure?.error) {
      setState({ phase: 'failed', problem: failure.error.message });
      return;
    }

    type MemberRow = {
      id: string;
      first_name: string;
      surname: string;
      principal_id: string;
      principal: { display_name: string } | null;
    };

    const households = new Map<string, Household>();
    const balanceOf = new Map<string, number>();
    for (const row of (balances.data ?? []) as { principal_id: string; balance_pence: number }[]) {
      balanceOf.set(row.principal_id, row.balance_pence);
    }

    const roster: RosterMember[] = [];
    for (const row of (members.data ?? []) as unknown as MemberRow[]) {
      roster.push({
        id: row.id,
        firstName: row.first_name,
        surname: row.surname,
        principalId: row.principal_id,
      });
      if (!households.has(row.principal_id)) {
        households.set(row.principal_id, {
          name: row.principal?.display_name ?? 'Household',
          balancePence: balanceOf.get(row.principal_id) ?? 0,
        });
      }
    }

    const here = new Map<string, string>();
    for (const row of (attendanceRows.data ?? []) as { id: string; member_id: string | null }[]) {
      if (row.member_id) here.set(row.member_id, row.id);
    }

    const attendedBefore = ((historyRows.data ?? []) as { member_id: string | null }[])
      .map((row) => row.member_id)
      .filter((id): id is string => id !== null);

    // Whose principal row records the cash, which is how the night is later
    // split by who took it.
    const actor = me.data.user
      ? ((await supabase
          .from('principals')
          .select('id')
          .eq('auth_user_id', me.data.user.id)
          .maybeSingle()).data?.id ?? '')
      : '';

    setState({
      phase: 'ready',
      data: {
        cash: (cashRows.data ?? []).map(
          (row): CashRow => ({
            principalId: row.principal_id,
            type: row.type,
            amountPence: row.amount_pence,
          }),
        ),
        actorId: actor,
        members: roster,
        households,
        inGroup: ((groupRows.data ?? []) as { member_id: string }[]).map((r) => r.member_id),
        attendedBefore,
        here,
      },
    });
  }, [session.id, session.groupId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const paidHouseholds = useMemo(
    () => (data ? householdsWhoPaid(data.cash) : new Set<string>()),
    [data],
  );

  const rows = useMemo(() => {
    if (!data) return [];

    const shown = rosterToShow({
      members: data.members,
      usuals,
      showing,
      term,
      presentOnly: hereOnly,
      present,
    });

    // Money collected is a filter in the same way the headcount is: the number
    // and the names behind it are one control, so when the tin does not match
    // there is nothing to go hunting for.
    return paidOnly ? shown.filter((member) => paidHouseholds.has(member.principalId)) : shown;
  }, [data, usuals, showing, term, hereOnly, present, paidOnly, paidHouseholds]);

  // One write per tap. The queue that coalesces a mis-tap before it reaches the
  // database belongs with the offline work; until then the RPC's idempotency is
  // what keeps a double tap honest, and an untick is a real reversal.
  //
  // Every state change here is a pure transition from `lib/training/night.ts`,
  // which is where the promise the screen makes — the row flips and the pot
  // moves before the write lands — is taken back if the write fails.
  async function toggle(member: RosterMember) {
    if (!data || saving.has(member.id)) return;

    const attendanceId = data.here.get(member.id);
    const wasHere = attendanceId !== undefined;

    // Mid-flight there is no attendance id to undo, so the untick has nothing
    // to send. Waiting is the honest answer.
    if (wasHere && !isSettled(data, member.id)) return;

    const tap = {
      memberId: member.id,
      principalId: member.principalId,
      wasHere,
      pricePence: session.pricePence,
    };

    setProblem(null);
    setSaving((current) => new Set(current).add(member.id));
    setState((current) =>
      current.phase === 'ready'
        ? { phase: 'ready', data: { ...current.data, ...flip(current.data, tap) } }
        : current,
    );

    const supabase = createSupabaseBrowserClient();
    const { data: result, error } = wasHere
      ? await supabase.rpc('undo_member_sign_in', { p_attendance_id: attendanceId! })
      : await supabase.rpc('sign_in_member', {
          p_member_id: member.id,
          p_session_id: session.id,
        });

    setSaving((current) => {
      const next = new Set(current);
      next.delete(member.id);
      return next;
    });

    setState((current) => {
      if (current.phase !== 'ready') return current;

      const next = error
        ? restore(current.data, { ...tap, attendanceId })
        : wasHere
          ? current.data
          : settle(current.data, { memberId: member.id, attendanceId: String(result) });

      return { phase: 'ready', data: { ...current.data, ...next } };
    });

    if (error) setProblem(`${member.firstName} ${member.surname}: ${error.message}`);
  }

  // Cash is a household fact, so the row that is written names the principal and
  // leaves member_id null. What changes is the difference between the figure on
  // screen and the one the registrar asked for — a top-up going up, a refund
  // coming down, never a negative top-up.
  async function saveCash(member: RosterMember, targetPence: number) {
    if (!data) return;

    const currentPence = cashTonight(data.cash, member.principalId);
    const row = planCashChange({
      currentPence,
      targetPence,
      principalId: member.principalId,
      sessionId: session.id,
      recordedBy: data.actorId,
      clientId: crypto.randomUUID(),
    });

    setCashFor(undefined);
    if (!row) return;

    const optimistic: CashRow = {
      principalId: member.principalId,
      type: row.type,
      amountPence: row.amount_pence,
    };

    setProblem(null);
    setState((current) =>
      current.phase === 'ready'
        ? { phase: 'ready', data: { ...current.data, cash: [...current.data.cash, optimistic] } }
        : current,
    );

    const { error } = await createSupabaseBrowserClient().from('credit_transactions').insert(row);

    if (error) {
      setProblem(`Cash for ${member.surname}: ${error.message}`);
      setState((current) =>
        current.phase === 'ready'
          ? {
              phase: 'ready',
              data: {
                ...current.data,
                cash: current.data.cash.filter((entry) => entry !== optimistic),
              },
            }
          : current,
      );
      return;
    }

    // The money is in the pot as well as in the tin, so the balance moves too.
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
      return { phase: 'ready', data: { ...current.data, households } };
    });
  }

  if (state.phase === 'loading') {
    return (
      <Screen title={session.name}>
        <p className="text-lg text-slate-400">Getting tonight's list…</p>
      </Screen>
    );
  }

  if (state.phase === 'failed') {
    return (
      <Screen title={session.name}>
        <Problem>Couldn't load the list. {state.problem}</Problem>
        <BigButton onClick={() => void load()}>Try again</BigButton>
      </Screen>
    );
  }

  const headcount = countHere(data!);
  const collected = moneyCollected(data!.cash);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 py-6">
      <header className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-slate-50">{session.name}</h1>
          <p className="truncate text-base text-slate-400">
            {formatClubTime(session.startsAt)} · {session.groupName}
          </p>
        </div>
        {/* Both numbers are filters, and the names behind them are the same
            control. One at a time: tapping either clears the other. */}
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => {
              setHereOnly((on) => !on);
              setPaidOnly(false);
            }}
            aria-pressed={hereOnly}
            className={`min-h-12 rounded-xl border px-3 text-center transition-colors ${
              hereOnly ? 'border-emerald-400 bg-emerald-500/15' : 'border-edge bg-raised'
            }`}
          >
            <span className="block text-xl font-bold text-slate-50">{headcount}</span>
            <span className="block text-xs text-slate-400">here</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPaidOnly((on) => !on);
              setHereOnly(false);
            }}
            aria-pressed={paidOnly}
            className={`min-h-12 rounded-xl border px-3 text-center transition-colors ${
              paidOnly ? 'border-emerald-400 bg-emerald-500/15' : 'border-edge bg-raised'
            }`}
          >
            <span className="block text-xl font-bold text-slate-50">{formatPounds(collected)}</span>
            <span className="block text-xs text-slate-400">collected</span>
          </button>
        </div>
      </header>

      <div className="sticky top-0 z-10 -mx-5 mt-4 bg-ground px-5 pt-2 pb-3">
        <input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Type part of a name…"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Find a runner"
          className="min-h-14 w-full rounded-xl border border-edge bg-raised px-4 text-lg text-slate-50 placeholder:text-slate-500"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex gap-2">
            {(['usuals', 'everyone'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setShowing(option)}
                aria-pressed={showing === option}
                className={`min-h-11 rounded-lg px-3 text-base transition-colors ${
                  showing === option
                    ? 'bg-slate-50 font-semibold text-slate-900'
                    : 'border border-edge bg-raised text-slate-300'
                }`}
              >
                {option === 'usuals' ? 'Usuals' : 'Everyone'}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-500">{rows.length} shown</p>
        </div>
      </div>

      {problem && (
        <div className="mb-3">
          <Problem>{problem}</Problem>
        </div>
      )}

      {rows.length > 0 ? (
        <ul className="flex flex-col gap-2 pb-6">
          {rows.map((member) => (
            <li key={member.id}>
              <RunnerRow
                member={member}
                household={data!.households.get(member.principalId)}
                pricePence={session.pricePence}
                cashPence={cashTonight(data!.cash, member.principalId)}
                isHere={present.has(member.id)}
                isSaving={saving.has(member.id)}
                onToggle={() => void toggle(member)}
                onCash={() => setCashFor(member)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="py-6">
          <Note>
            {hereOnly
              ? 'Nobody is signed in yet.'
              : paidOnly
                ? 'Nobody has handed anything over yet.'
                : term
                ? `Nobody matches "${term}". Guests are not in this list yet.`
                : 'Nobody is on tonight’s list. Try Everyone, or assign the squad on the website.'}
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
          onClose={() => setCashFor(undefined)}
        />
      )}

      {onBack && (
        <div className="mt-auto pt-4 pb-6">
          <BigButton tone="quiet" onClick={onBack}>
            Pick a different session
          </BigButton>
        </div>
      )}
    </div>
  );
}
