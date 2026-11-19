import { useState } from 'react';
import { formatClubTime } from '../../lib/training/club-time';
import type { SelectableSession } from '../../lib/training/tonight';
import { alreadyOnTonight, type SessionGroup } from '../../lib/training/track-session';
import { BigButton, Note } from './ui';

// Starting a session at the track.
//
// It lives *under* tonight's list, never in place of it. A registrar who cannot
// see what is already on is a registrar who starts a second Endurance beside
// the one the other phone opened, and the evening ends up in two halves.

export function StartSession({
  groups,
  tonight,
  onStart,
  onOpenExisting,
}: {
  groups: SessionGroup[];
  tonight: SelectableSession[];
  onStart: (group: SessionGroup) => void;
  onOpenExisting: (session: SelectableSession) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [checking, setChecking] = useState<SessionGroup | undefined>();

  if (groups.length === 0) {
    return (
      <Note>
        No squads have been set up yet, and a session belongs to one. A club admin adds them on
        the website under Admin → Groups.
      </Note>
    );
  }

  // The warning, with what is already running named rather than described.
  if (checking) {
    const clashes = alreadyOnTonight(tonight, checking.id);

    return (
      <div className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-raised/50 p-4">
        <Note>
          <p className="font-semibold text-slate-100">
            {checking.name} already has a session tonight.
          </p>
          <p className="mt-1">
            Somebody may have started it on another phone. Opening theirs keeps the night in one
            place; starting another splits the headcount and the money between the two.
          </p>
        </Note>

        <ul className="flex flex-col gap-2">
          {clashes.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => onOpenExisting(session)}
                className="min-h-16 w-full rounded-xl border border-emerald-500/60 bg-emerald-500/10 px-5 text-left active:bg-emerald-500/20"
              >
                <span className="block text-lg font-semibold text-slate-50">
                  Open {session.name}
                </span>
                <span className="block text-base text-slate-400">
                  started {formatClubTime(session.startsAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <BigButton
          tone="quiet"
          onClick={() => {
            onStart(checking);
            setChecking(undefined);
            setPicking(false);
          }}
        >
          Start another anyway
        </BigButton>
        <BigButton tone="quiet" onClick={() => setChecking(undefined)}>
          Back
        </BigButton>
      </div>
    );
  }

  if (!picking) {
    return (
      <BigButton tone="quiet" onClick={() => setPicking(true)}>
        Start a session here
      </BigButton>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-edge bg-raised/50 p-4">
      <p className="text-base font-semibold text-slate-200">Which squad is training?</p>
      <ul className="flex flex-col gap-2">
        {groups.map((group) => (
          <li key={group.id}>
            <button
              type="button"
              onClick={() =>
                alreadyOnTonight(tonight, group.id).length > 0
                  ? setChecking(group)
                  : onStart(group)
              }
              className="min-h-14 w-full rounded-xl border border-edge bg-ground px-4 text-left text-lg text-slate-100 active:bg-slate-700"
            >
              {group.name}
            </button>
          </li>
        ))}
      </ul>
      <BigButton tone="quiet" onClick={() => setPicking(false)}>
        Cancel
      </BigButton>
    </div>
  );
}
