import { useCallback, useEffect, useState } from 'react';
import { formatClubTime } from '../../lib/training/club-time';
import { clubDayKey } from '../../lib/training/club-time';
import {
  clubDayWindow,
  theOnlyChoice,
  tonightsSessions,
  type SelectableSession,
  type TonightsSessions,
} from '../../lib/training/tonight';
import { createSupabaseBrowserClient } from '../../lib/supabase/browser';
import { loadSnapshot, saveSnapshot } from '../../lib/training/snapshot';
import { planTrackSession, type SessionGroup } from '../../lib/training/track-session';
import { AttendanceView } from './AttendanceView';
import { StartSession } from './StartSession';
import type { Outbox } from './useWriteQueue';
import { InstallHint } from './InstallHint';
import { BigButton, Note, Problem, Screen } from './ui';

// The first screen after sign-in: which session is being run tonight.
//
// Creating a session is the admin site's job. The fallback for the night nobody
// got round to it is the next piece of work, so for now this says plainly that
// there is nothing to sign into rather than pretending there is an option.

type Load =
  | { state: 'loading' }
  | { state: 'loaded'; tonight: TonightsSessions }
  | { state: 'failed'; problem: string };

export function SessionPicker({ authUserId, outbox }: { authUserId: string; outbox: Outbox }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [chosen, setChosen] = useState<SelectableSession | undefined>();
  const [groups, setGroups] = useState<SessionGroup[]>([]);
  const [actorId, setActorId] = useState('');
  const [startedHere, setStartedHere] = useState<SelectableSession[]>([]);


  const refresh = useCallback(async () => {
    setLoad({ state: 'loading' });

    try {
      const now = new Date();
      const window = clubDayWindow(now);

      const supabase = createSupabaseBrowserClient();

      void supabase
        .from('groups')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
        .then(({ data: rows }) => setGroups((rows ?? []) as SessionGroup[]));

      void supabase.auth.getSession().then(async ({ data: auth }) => {
        const authUserId = auth.session?.user.id;
        if (!authUserId) return;
        const { data: principal } = await supabase
          .from('principals')
          .select('id')
          .eq('auth_user_id', authUserId)
          .maybeSingle();
        setActorId(principal?.id ?? '');
      });

      const { data, error } = await supabase
        .from('training_sessions')
        .select('id, starts_at, note, price_pence, is_cancelled, group_id, group:group_id(name)')
        .gte('starts_at', window.from)
        .lt('starts_at', window.until)
        .order('starts_at');

      if (error) {
        // The picker fails before the attendance view is ever reached, so caching
        // the night's data alone would never be seen. Keyed by Omagh's day, so
        // last Monday's session is never offered as tonight's.
        const stored = await loadSnapshot<SelectableSession[]>(`tonight:${clubDayKey(now)}`);
        if (stored) {
          setLoad({
            state: 'loaded',
            tonight: tonightsSessions(stored.data, now),
          });
          return;
        }

        setLoad({ state: 'failed', problem: error.message });
        return;
      }

      const sessions = (data ?? []).map(asSelectable);
      void saveSnapshot(`tonight:${clubDayKey(now)}`, sessions);
      setLoad({ state: 'loaded', tonight: tonightsSessions(sessions, now) });
    } catch {
      // A request that never left the phone throws rather than returning
      // an error, and this screen comes before the attendance view, so an
      // uncaught throw hangs the app before the cache is ever consulted.
      const now = new Date();
      const stored = await loadSnapshot<SelectableSession[]>(`tonight:${clubDayKey(now)}`);
      setLoad(
        stored
          ? { state: 'loaded', tonight: tonightsSessions(stored.data, now) }
          : {
              state: 'failed',
              problem: 'No signal, and tonight has not been loaded on this phone yet.',
            },
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function startSession(group: SessionGroup) {
    const row = planTrackSession({ group, createdBy: actorId, id: crypto.randomUUID() });

    // Shown as tonight's straight away. The write goes first in the queue, so
    // the session row reaches Postgres before any attendance that names it —
    // attendance.session_id is a RESTRICT reference and would be refused.
    const session: SelectableSession = {
      id: row.id!,
      startsAt: row.starts_at,
      note: null,
      pricePence: row.price_pence,
      isCancelled: false,
      groupId: group.id,
      groupName: group.name,
    };

    outbox.add({ kind: 'create_session', row });
    setStartedHere((current) => [...current, session]);
    setChosen(session);
  }

  if (load.state === 'loading') {
    return (
      <Screen title="Tonight">
        <p className="text-lg text-neutral-400">Looking for tonight's sessions…</p>
      </Screen>
    );
  }

  if (load.state === 'failed') {
    return (
      <Screen title="Tonight">
        <Problem>Couldn't load tonight's sessions. {load.problem}</Problem>
        <BigButton onClick={() => void refresh()}>Try again</BigButton>
      </Screen>
    );
  }

  const { available, cancelled } = load.tonight;
  const tonightIncludingOurs = [...available, ...startedHere];
  const opened = chosen ?? theOnlyChoice(load.tonight);

  if (opened) {
    return (
      <AttendanceView
        authUserId={authUserId}
        outbox={outbox}
        session={opened}
        onBack={available.length > 1 ? () => setChosen(undefined) : undefined}
      />
    );
  }

  return (
    <Screen title="Tonight">
      {available.length > 0 ? (
        <>
          <p className="text-lg text-neutral-300">Which session are you taking?</p>
          <ul className="flex flex-col gap-3">
            {available.map((session) => (
              <li key={session.id}>
                <SessionChoice session={session} onChoose={() => setChosen(session)} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-lg text-neutral-300">
Nothing is scheduled for tonight. Start one below and sign runners in.
        </p>
      )}

      {cancelled.length > 0 && (
        <Note>
          Called off tonight: {cancelled.map((session) => session.groupName).join(', ')}.
        </Note>
      )}

      <StartSession
        groups={groups}
        tonight={tonightIncludingOurs}
        onStart={startSession}
        onOpenExisting={setChosen}
      />

      <BigButton tone="quiet" onClick={() => void refresh()}>
        Check again
      </BigButton>

      <InstallHint />
    </Screen>
  );
}

function SessionChoice({
  session,
  onChoose,
}: {
  session: SelectableSession;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      className="min-h-20 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-5 py-4 text-left active:bg-neutral-800"
    >
      <span className="block text-xl font-semibold text-white">{session.groupName}</span>
      <span className="mt-0.5 block text-base text-neutral-400">
        {formatClubTime(session.startsAt)}
      </span>
      {session.note && (
        <span className="mt-1 block text-base text-amber">{session.note}</span>
      )}
    </button>
  );
}

type SessionRow = {
  id: string;
  starts_at: string;
  note: string | null;
  price_pence: number;
  is_cancelled: boolean;
  group_id: string;
  group: { name: string } | null;
};

// Typed as the query's row, not `unknown`: the picker once shipped asking for
// two dropped columns, and a cast through `unknown` stopped TypeScript
// comparing the query with this shape.
function asSelectable(session: SessionRow): SelectableSession {
  return {
    id: session.id,
    startsAt: session.starts_at,
    note: session.note,
    pricePence: session.price_pence,
    isCancelled: session.is_cancelled,
    groupId: session.group_id,
    groupName: session.group?.name ?? 'Unknown group',
  };
}
