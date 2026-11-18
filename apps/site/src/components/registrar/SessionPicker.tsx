import { useCallback, useEffect, useState } from 'react';
import { formatClubTime } from '../../lib/training/club-time';
import { formatPounds } from '../../lib/credits/money';
import {
  clubDayWindow,
  theOnlyChoice,
  tonightsSessions,
  type SelectableSession,
  type TonightsSessions,
} from '../../lib/training/tonight';
import { createSupabaseBrowserClient } from '../../lib/supabase/browser';
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

export function SessionPicker() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [chosen, setChosen] = useState<SelectableSession | undefined>();

  const refresh = useCallback(async () => {
    setLoad({ state: 'loading' });

    const now = new Date();
    const window = clubDayWindow(now);

    const { data, error } = await createSupabaseBrowserClient()
      .from('training_sessions')
      .select('id, name, starts_at, location, price_pence, is_cancelled, group:group_id(name)')
      .gte('starts_at', window.from)
      .lt('starts_at', window.until)
      .order('starts_at');

    if (error) {
      setLoad({ state: 'failed', problem: error.message });
      return;
    }

    setLoad({ state: 'loaded', tonight: tonightsSessions((data ?? []).map(asSelectable), now) });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (load.state === 'loading') {
    return (
      <Screen title="Tonight">
        <p className="text-lg text-slate-400">Looking for tonight's sessions…</p>
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
  const opened = chosen ?? theOnlyChoice(load.tonight);

  if (opened) {
    return (
      <Chosen
        session={opened}
        onBack={available.length > 1 ? () => setChosen(undefined) : undefined}
      />
    );
  }

  return (
    <Screen title="Tonight">
      {available.length > 0 ? (
        <>
          <p className="text-lg text-slate-300">Which session are you taking?</p>
          <ul className="flex flex-col gap-3">
            {available.map((session) => (
              <li key={session.id}>
                <SessionChoice session={session} onChoose={() => setChosen(session)} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-lg text-slate-300">
          Nothing is scheduled for tonight. Sessions are created on the website, under Admin →
          Training sessions.
        </p>
      )}

      {cancelled.length > 0 && (
        <Note>
          Called off tonight: {cancelled.map((session) => session.name).join(', ')}.
        </Note>
      )}

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
      className="min-h-20 w-full rounded-xl border border-edge bg-raised px-5 py-4 text-left active:bg-slate-700"
    >
      <span className="block text-xl font-semibold text-slate-50">{session.name}</span>
      <span className="mt-0.5 block text-base text-slate-400">
        {formatClubTime(session.startsAt)} · {session.groupName}
        {session.location ? ` · ${session.location}` : ''}
      </span>
    </button>
  );
}

// The attendance view is the next piece of work. Until it exists this confirms
// what was picked, so the route can be deployed and installed on its own.
function Chosen({ session, onBack }: { session: SelectableSession; onBack?: () => void }) {
  return (
    <Screen title={session.name}>
      <p className="text-lg text-slate-300">
        {formatClubTime(session.startsAt)} · {session.groupName}
        {session.location ? ` · ${session.location}` : ''}
      </p>
      <p className="text-lg text-slate-300">{formatPounds(session.pricePence)} a runner.</p>
      <Note>
        The list of runners comes next. This screen exists so the sign-in and the session
        selector can be installed and used before the attendance view is built.
      </Note>
      {onBack && (
        <BigButton tone="quiet" onClick={onBack}>
          Pick a different session
        </BigButton>
      )}
      <InstallHint />
    </Screen>
  );
}

type SessionRow = {
  id: string;
  name: string;
  starts_at: string;
  location: string | null;
  price_pence: number;
  is_cancelled: boolean;
  group: { name: string } | null;
};

function asSelectable(row: unknown): SelectableSession {
  const session = row as SessionRow;
  return {
    id: session.id,
    name: session.name,
    startsAt: session.starts_at,
    location: session.location,
    pricePence: session.price_pence,
    isCancelled: session.is_cancelled,
    groupName: session.group?.name ?? 'Unknown group',
  };
}
