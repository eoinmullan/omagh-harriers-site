import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { formatClubDate, formatClubTime } from '../../lib/training/club-time';
import { clubDayKey } from '../../lib/training/club-time';
import {
  clubDayWindow,
  pastSessionsToOffer,
  pastSessionsWindow,
  tonightsSessions,
  type SelectableSession,
  type TonightsSessions,
} from '../../lib/training/tonight';
import { createSupabaseBrowserClient } from '../../lib/supabase/browser';
import { WATCH_INTERVAL_MS } from '../../lib/training/watching';
import { dayChannel } from '../../lib/training/nudge';
import { listenForNudges } from './nudges';
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
  // Looking back over the last fortnight to put a night right.
  const [browsingPast, setBrowsingPast] = useState(false);

  // An open session is a history entry of its own, so the phone's back gesture
  // returns to this list, as it would in any app, instead of leaving.
  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      setBrowsingPast(Boolean(event.state?.registrarPast));
      if (event.state?.registrarSession) return;
      setChosen(undefined);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);


  // `quietly` is the background refresh: the list on screen stays until a new
  // one arrives, and a failure leaves it alone rather than replacing it with a
  // problem. The registrar asked for nothing, so nothing should flicker.
  const refresh = useCallback(async (quietly = false) => {
    if (!quietly) setLoad({ state: 'loading' });

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
        if (quietly) return;
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
      if (quietly) return;
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

  // The list keeps up with the other phone by itself, as the night screen
  // does: every minute while it's on screen, and as soon as the app
  // comes back to the front. A session started at the gate on another phone
  // appears without anybody having to know to ask for it, which is what the
  // "Check again" button used to be for.
  const onTheList = !chosen && !browsingPast;

  // Another phone started a session today: refresh straight away rather than
  // waiting for the poll (nudge.ts). Keyed by today, so it moves on at
  // midnight with the list.
  const today = clubDayKey(new Date());
  useEffect(() => {
    if (!onTheList) return;
    return listenForNudges(createSupabaseBrowserClient(), dayChannel(today), () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh(true);
    });
  }, [onTheList, today, refresh]);

  useEffect(() => {
    if (!onTheList) return;

    const refreshIfShowing = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh(true);
    };

    const timer = window.setInterval(refreshIfShowing, WATCH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshIfShowing);
    window.addEventListener('focus', refreshIfShowing);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfShowing);
      window.removeEventListener('focus', refreshIfShowing);
    };
  }, [onTheList, refresh]);

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

  function backToList() {
    // Done and the back gesture are the same move. Going back through history
    // keeps the two in step; without an entry to go back to, just close it.
    if (window.history.state?.registrarSession) {
      window.history.back();
      return;
    }
    setChosen(undefined);
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
  if (chosen) {
    return (
      <AsHistoryEntry entry={{ registrarSession: chosen.id, registrarPast: browsingPast }}>
        <AttendanceView
          authUserId={authUserId}
          outbox={outbox}
          session={chosen}
          onBack={backToList}
        />
      </AsHistoryEntry>
    );
  }

  if (browsingPast) {
    return (
      <AsHistoryEntry entry={{ registrarPast: true }}>
        <PastSessions
          onChoose={setChosen}
          onBack={() => {
            if (window.history.state?.registrarPast) window.history.back();
            else setBrowsingPast(false);
          }}
        />
      </AsHistoryEntry>
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


      <BigButton tone="quiet" onClick={() => setBrowsingPast(true)}>
        Past sessions
      </BigButton>

      <InstallHint />
    </Screen>
  );
}

type HistoryEntry = { registrarSession?: string; registrarPast?: boolean };

// Each screen past the home screen is a history entry of its own, so the back
// gesture steps back through them as it would in any app.
function AsHistoryEntry({ entry, children }: { entry: HistoryEntry; children: ReactNode }) {
  const { registrarSession, registrarPast } = entry;
  useEffect(() => {
    const current: HistoryEntry | null = window.history.state;
    if (current?.registrarSession === registrarSession && current?.registrarPast === registrarPast) return;
    window.history.pushState({ registrarSession, registrarPast }, '');
  }, [registrarSession, registrarPast]);
  return <>{children}</>;
}

type PastLoad =
  | { state: 'loading' }
  | { state: 'loaded'; sessions: SelectableSession[] }
  | { state: 'failed' };

// The last fortnight, newest first, so a registrar can put a night right the
// next day. Opening one is the same screen as tonight's.
function PastSessions({
  onChoose,
  onBack,
}: {
  onChoose: (session: SelectableSession) => void;
  onBack: () => void;
}) {
  const [load, setLoad] = useState<PastLoad>({ state: 'loading' });

  const fetchPast = useCallback(async () => {
    setLoad({ state: 'loading' });
    try {
      const window = pastSessionsWindow(new Date());
      const { data, error } = await createSupabaseBrowserClient()
        .from('training_sessions')
        .select('id, starts_at, note, price_pence, is_cancelled, group_id, group:group_id(name)')
        .gte('starts_at', window.from)
        .lt('starts_at', window.until);
      setLoad(error ? { state: 'failed' } : { state: 'loaded', sessions: pastSessionsToOffer((data ?? []).map(asSelectable)) });
    } catch {
      setLoad({ state: 'failed' });
    }
  }, []);

  useEffect(() => {
    void fetchPast();
  }, [fetchPast]);

  return (
    <Screen title="Past sessions">
      {load.state === 'loading' && <p className="text-lg text-neutral-400">Looking back over the last fortnight…</p>}
      {load.state === 'failed' && (
        <>
          <Problem>Couldn't load past sessions. They need a signal.</Problem>
          <BigButton onClick={() => void fetchPast()}>Try again</BigButton>
        </>
      )}
      {load.state === 'loaded' &&
        (load.sessions.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {load.sessions.map((session) => (
              <li key={session.id}>
                <SessionChoice session={session} showDate onChoose={() => onChoose(session)} />
              </li>
            ))}
          </ul>
        ) : (
          <Note>No sessions in the last fortnight.</Note>
        ))}
      <BigButton tone="quiet" onClick={onBack}>
        Back to tonight
      </BigButton>
    </Screen>
  );
}

function SessionChoice({
  session,
  showDate,
  onChoose,
}: {
  session: SelectableSession;
  showDate?: boolean;
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
        {showDate ? `${formatClubDate(session.startsAt)}, ${formatClubTime(session.startsAt)}` : formatClubTime(session.startsAt)}
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
