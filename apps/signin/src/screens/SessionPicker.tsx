import { useCallback, useEffect, useState } from 'react';
import { formatClubTime, formatPounds } from '@omagh/training';
import { BigButton } from '../components/BigButton';
import { Screen } from '../components/Screen';
import {
  clubDayWindow,
  theOnlyChoice,
  tonightsSessions,
  type SelectableSession,
  type TonightsSessions,
} from '../lib/tonight';
import { supabase } from '../supabase';

// The first screen after sign-in: which session is being run tonight.
//
// Creating a session is the admin site's job. The fallback for the night nobody
// got round to it is the next piece of work, not this one — so for now the
// screen says plainly that there is nothing to sign into, rather than pretending
// the registrar has an option they don't.

type Load = { state: 'loading' } | { state: 'loaded'; tonight: TonightsSessions } | { state: 'failed'; problem: string };

export function SessionPicker() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [chosen, setChosen] = useState<SelectableSession | undefined>();

  const refresh = useCallback(async () => {
    setLoad({ state: 'loading' });
    const now = new Date();
    const window = clubDayWindow(now);

    const { data, error } = await supabase
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
        <p role="alert" className="rounded-xl bg-red-950 px-4 py-3 text-base text-red-200">
          Couldn't load tonight's sessions. {load.problem}
        </p>
        <BigButton onClick={() => void refresh()}>Try again</BigButton>
      </Screen>
    );
  }

  const { available, cancelled } = load.tonight;
  const obvious = theOnlyChoice(load.tonight);

  if (chosen || obvious) {
    return <Chosen session={(chosen ?? obvious)!} onBack={available.length > 1 ? () => setChosen(undefined) : undefined} />;
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
          Nothing is scheduled for tonight. A club admin creates sessions on the website, under
          Admin → Training sessions.
        </p>
      )}

      {cancelled.length > 0 && (
        <div className="rounded-xl border border-edge bg-raised px-4 py-3">
          <p className="text-base text-slate-300">
            {cancelled.length === 1 ? 'Called off tonight:' : 'Called off tonight:'}{' '}
            {cancelled.map((session) => session.name).join(', ')}.
          </p>
        </div>
      )}

      <BigButton tone="quiet" onClick={() => void refresh()}>
        Check again
      </BigButton>
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
// what was picked, so the selector can be used and deployed on its own.
function Chosen({ session, onBack }: { session: SelectableSession; onBack?: () => void }) {
  return (
    <Screen title={session.name}>
      <p className="text-lg text-slate-300">
        {formatClubTime(session.startsAt)} · {session.groupName}
        {session.location ? ` · ${session.location}` : ''}
      </p>
      <p className="text-lg text-slate-300">{formatPounds(session.pricePence)} a runner.</p>
      <div className="rounded-xl border border-edge bg-raised px-4 py-3">
        <p className="text-base text-slate-400">
          The list of runners comes next. This screen exists so the sign-in and the session
          selector can be deployed and used before the attendance view is built.
        </p>
      </div>
      {onBack && (
        <BigButton tone="quiet" onClick={onBack}>
          Pick a different session
        </BigButton>
      )}
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
