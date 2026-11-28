import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  decideAboutCopy,
  describeCopyAge,
  findPeople,
  sessionsToday,
  telHref,
  type ContactPerson,
  type EmergencyCopy,
  type SessionToday,
  type SignedInRunner,
} from '../../lib/emergency/copy';
import { forgetCopy, loadCopy, saveCopy } from '../../lib/emergency/copy-store';
import { fetchCopy } from '../../lib/emergency/fetch-copy';
import { createSupabaseBrowserClient } from '../../lib/supabase/browser';
import { formatClubTime } from '../../lib/training/club-time';
import { describeLostWrite } from '../../lib/training/lost-write';
import type { Outbox } from '../registrar/useWriteQueue';
import { BigButton, Note, Problem, Screen } from '../registrar/ui';

// Tonight's sessions first, then a search of the whole club; tap anybody for
// their emergency contact. Every opening of a member's contact goes into the
// outbox as a record, sent when there's signal (migration 0026).
//
// What's on screen comes from the phone's copy until a fresh read replaces
// it, so the section opens with no signal. The copy is refreshed on every
// online open, on coming back to the app, and every minute while it's open.

type Load = { state: 'loading' } | { state: 'ready'; copy: EmergencyCopy; savedAt: number; live: boolean } | { state: 'nothing' };

type View = { kind: 'home' } | { kind: 'session'; sessionId: string } | { kind: 'person'; runner: SignedInRunner };

const REFRESH_MS = 60_000;

function useCopy(authUserId: string): Load {
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const copy = await fetchCopy(createSupabaseBrowserClient(), authUserId);
      await saveCopy(copy);
      setLoad({ state: 'ready', copy, savedAt: Date.now(), live: true });
    } catch {
      // No signal, or a read refused: keep what's on screen, and say how old
      // it is. With nothing saved there's nothing to show.
      setLoad((current) =>
        current.state === 'ready' ? { ...current, live: false } : current.state === 'loading' ? { state: 'nothing' } : current,
      );
    }
  }, [authUserId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadCopy().catch(() => undefined);
      if (cancelled) return;
      if (stored && decideAboutCopy({ holdsFlag: true, savedAt: stored.savedAt, now: new Date() }) === 'delete') {
        await forgetCopy();
      } else if (stored) {
        setLoad({ state: 'ready', copy: stored.data, savedAt: stored.savedAt, live: false });
      }
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const timer = setInterval(onShow, REFRESH_MS);
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('online', onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('online', onShow);
    };
  }, [refresh]);

  return load;
}

// Each screen past the first is a history entry, so Android's back button and
// the ‹ in the header both step back rather than closing the app.
function useView(): [View, (next: View) => void, () => void] {
  const [view, setView] = useState<View>({ kind: 'home' });

  useEffect(() => {
    window.history.replaceState({ emergencyView: { kind: 'home' } }, '');
    const onPop = (event: PopStateEvent) => setView((event.state?.emergencyView as View | undefined) ?? { kind: 'home' });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const open = useCallback((next: View) => {
    window.history.pushState({ emergencyView: next }, '');
    setView(next);
    window.scrollTo(0, 0);
  }, []);

  return [view, open, () => window.history.back()];
}

export function ContactsView({ authUserId, outbox, logo }: { authUserId: string; outbox: Outbox; logo: string }) {
  const load = useCopy(authUserId);
  const [view, open, back] = useView();
  // Kept here, not in the home screen, so it's still there after looking at
  // somebody's contact and coming back.
  const [term, setTerm] = useState('');

  if (load.state === 'loading') {
    return (
      <Screen title="Emergency contacts" switcher="emergency" logo={logo}>
        <p className="text-lg text-neutral-400">Opening…</p>
      </Screen>
    );
  }

  if (load.state === 'nothing') {
    return (
      <Screen title="Emergency contacts" switcher="emergency" logo={logo}>
        <Problem>No signal, and no contacts saved on this phone yet. Open this once with a connection and it will work without one afterwards.</Problem>
      </Screen>
    );
  }

  const { copy } = load;
  const age = load.live ? undefined : describeCopyAge(load.savedAt);

  if (view.kind === 'person') {
    return <PersonScreen runner={view.runner} copy={copy} outbox={outbox} onBack={back} logo={logo} />;
  }

  if (view.kind === 'session') {
    const session = copy.sessions.find((candidate) => candidate.id === view.sessionId);
    if (session) {
      return (
        <SessionScreen
          session={session}
          age={age}
          hasContact={(memberId) => copy.people.some((person) => person.memberId === memberId && person.contactPhone !== null)}
          onBack={back}
          onOpen={(runner) => open({ kind: 'person', runner })}
          logo={logo}
        />
      );
    }
  }

  return (
    <HomeScreen
      copy={copy}
      age={age}
      outbox={outbox}
      term={term}
      onSearch={setTerm}
      onSession={(sessionId) => open({ kind: 'session', sessionId })}
      onOpen={(runner) => open({ kind: 'person', runner })}
      logo={logo}
    />
  );
}

function HomeScreen({
  copy,
  age,
  outbox,
  term,
  onSearch,
  onSession,
  onOpen,
  logo,
}: {
  copy: EmergencyCopy;
  age: string | undefined;
  outbox: Outbox;
  term: string;
  onSearch: (term: string) => void;
  onSession: (sessionId: string) => void;
  onOpen: (runner: SignedInRunner) => void;
  logo: string;
}) {
  const today = sessionsToday(copy);
  const found = useMemo(() => (term.trim() ? findPeople(copy.people, term) : []), [copy.people, term]);
  const nameOf = (memberId: string) => {
    const person = copy.people.find((candidate) => candidate.memberId === memberId);
    return person ? `${person.firstName} ${person.surname}` : undefined;
  };

  return (
    <Screen title="Emergency contacts" switcher="emergency" logo={logo}>
      {age && <p className="-mt-3 text-sm text-amber">{age}</p>}

      {outbox.refused.map((refusal) => (
        <Problem key={refusal.id}>
          {describeLostWrite(refusal.write, { member: nameOf, household: () => undefined, guest: () => undefined })}
        </Problem>
      ))}
      {outbox.refused.length > 0 && (
        <BigButton tone="quiet" onClick={outbox.dismissRefusals}>
          Dismiss
        </BigButton>
      )}

      <section aria-labelledby="today-heading" className="flex flex-col gap-3">
        <h2 id="today-heading" className="text-sm font-semibold tracking-wider text-neutral-400 uppercase">
          Today
        </h2>
        {today.length === 0 ? (
          <p className="text-base text-neutral-400">No sessions today. Search for anybody below.</p>
        ) : (
          today.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => onSession(session.id)}
              className="flex min-h-[76px] w-full items-center justify-between gap-4 rounded-xl bg-neutral-900 px-5 text-left active:bg-neutral-800"
            >
              <span>
                <span className="block text-lg font-semibold text-white">{session.groupName}</span>
                <span className="block text-sm text-neutral-400">
                  {formatClubTime(session.startsAt)} · {session.signedIn.length} signed in
                </span>
              </span>
              <span aria-hidden="true" className="text-2xl text-neutral-500">
                ›
              </span>
            </button>
          ))
        )}
      </section>

      <section aria-labelledby="search-heading" className="flex flex-col gap-3">
        <h2 id="search-heading" className="text-sm font-semibold tracking-wider text-neutral-400 uppercase">
          Everyone
        </h2>
        <input
          type="search"
          value={term}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search by name"
          aria-label="Search everyone by name"
          autoComplete="off"
          className="min-h-14 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 text-lg text-white placeholder:text-neutral-500"
        />
        {term.trim() !== '' && found.length === 0 && <p className="text-base text-neutral-400">Nobody by that name.</p>}
        {found.length > 0 && (
          <ul className="-mx-5 border-t border-neutral-800">
            {found.map((person) => (
              <li key={person.memberId}>
                <RunnerRow runner={person} hasContact={person.contactPhone !== null} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Screen>
  );
}

function SessionScreen({
  session,
  age,
  hasContact,
  onBack,
  onOpen,
  logo,
}: {
  session: SessionToday;
  age: string | undefined;
  hasContact: (memberId: string) => boolean;
  onBack: () => void;
  onOpen: (runner: SignedInRunner) => void;
  logo: string;
}) {
  return (
    <Screen logo={logo}>
      <BackHeader onBack={onBack} title={session.groupName} subtitle={formatClubTime(session.startsAt)} />
      {age && <p className="-mt-3 text-sm text-amber">Who's signed in may have changed. {age}</p>}
      {session.signedIn.length === 0 ? (
        <p className="text-lg text-neutral-400">Nobody signed in yet.</p>
      ) : (
        <ul className="-mx-5 border-t border-neutral-800">
          {session.signedIn.map((runner, index) => (
            <li key={runner.memberId ?? `guest-${index}`}>
              <RunnerRow runner={runner} hasContact={runner.memberId ? hasContact(runner.memberId) : undefined} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}

function PersonScreen({
  runner,
  copy,
  outbox,
  onBack,
  logo,
}: {
  runner: SignedInRunner;
  copy: EmergencyCopy;
  outbox: Outbox;
  onBack: () => void;
  logo: string;
}) {
  const person: ContactPerson | undefined = runner.memberId
    ? copy.people.find((candidate) => candidate.memberId === runner.memberId)
    : undefined;
  const name = `${runner.firstName} ${runner.surname}`;

  // Recorded once per opening, when the screen appears: keyed on the member,
  // so a re-render while it's open isn't a second opening.
  useEffect(() => {
    if (!runner.memberId) return;
    outbox.add({
      kind: 'emergency_opening',
      openingId: crypto.randomUUID(),
      memberId: runner.memberId,
      openedBy: copy.principalId,
      openedAt: new Date().toISOString(),
    });
  }, [runner.memberId]);

  const phone = person?.contactPhone ?? null;
  const href = phone ? telHref(phone) : undefined;

  return (
    <Screen logo={logo}>
      <BackHeader onBack={onBack} title={name} />
      {!runner.memberId ? (
        <Note>{name} is a guest. Guests don't have an emergency contact on file.</Note>
      ) : !phone ? (
        <Note>No emergency contact on file for {name}.</Note>
      ) : (
        <section aria-label="Emergency contact" className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-semibold tracking-wider text-neutral-400 uppercase">Emergency contact</p>
            <p className="mt-1 text-2xl font-semibold text-white">{person?.contactName ?? 'Name not given'}</p>
            <p className="mt-1 text-xl text-neutral-300 tabular-nums">{phone}</p>
          </div>
          {href && (
            <a
              href={href}
              className="flex min-h-16 w-full items-center justify-center rounded-xl bg-amber px-5 text-xl font-bold text-black active:opacity-80"
            >
              Call {phone}
            </a>
          )}
        </section>
      )}
    </Screen>
  );
}

function BackHeader({ onBack, title, subtitle }: { onBack: () => void; title: string; subtitle?: string }) {
  return (
    <div className="-mt-2 flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="-ml-3 flex size-11 shrink-0 items-center justify-center rounded-full text-3xl leading-none text-neutral-300 active:bg-neutral-800"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-sm text-neutral-400">{subtitle}</p>}
      </div>
    </div>
  );
}

function RunnerRow({
  runner,
  hasContact,
  onOpen,
}: {
  runner: SignedInRunner;
  hasContact?: boolean;
  onOpen: (runner: SignedInRunner) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen({ memberId: runner.memberId, firstName: runner.firstName, surname: runner.surname })}
      className="flex min-h-[76px] w-full items-center justify-between gap-4 border-b border-neutral-800 px-5 text-left active:bg-neutral-900"
    >
      <span className="min-w-0 text-lg text-white">
        <span className="font-bold tracking-wide uppercase">{runner.surname}</span> {runner.firstName}
        {runner.memberId === null && <span className="ml-2 text-sm text-neutral-400">guest</span>}
      </span>
      <span className="flex shrink-0 items-center gap-3">
        {hasContact === false && <span className="text-sm text-neutral-400">no contact</span>}
        <span aria-hidden="true" className="text-2xl text-neutral-500">
          ›
        </span>
      </span>
    </button>
  );
}
