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

  if (groups.length === 0) {
    return (
      <Note>
        No squads have been set up yet, and a session belongs to one. A club admin adds them on
        the website under Admin → Squads.
      </Note>
    );
  }

  if (!picking) {
    return (
      <BigButton tone="outline" onClick={() => setPicking(true)}>
        Create a new session
      </BigButton>
    );
  }

  // A squad that's already on today says so on its own button and opens that
  // session, because the usual reason to look for it here is that the other
  // phone started it. It used to lead to a paragraph and an "Open" button for
  // a session that was already the first card on the screen. A second session
  // for the same squad is still possible, one deliberate tap further down.
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <p className="text-base font-semibold text-neutral-200">Which squad is training?</p>
      <ul className="flex flex-col gap-2">
        {groups.map((group) => {
          const alreadyOn = alreadyOnTonight(tonight, group.id)[0];
          return (
            <li key={group.id}>
              <button
                type="button"
                onClick={() => (alreadyOn ? onOpenExisting(alreadyOn) : onStart(group))}
                className="min-h-14 w-full rounded-xl border border-neutral-800 bg-black px-4 py-2 text-left active:bg-neutral-800"
              >
                <span className="block text-lg text-neutral-100">{group.name}</span>
                {alreadyOn && (
                  <span className="block text-sm text-amber">
                    On at {formatClubTime(alreadyOn.startsAt)} — open it
                  </span>
                )}
              </button>
              {alreadyOn && (
                <button
                  type="button"
                  onClick={() => {
                    onStart(group);
                    setPicking(false);
                  }}
                  className="mt-1 px-4 py-2 text-sm text-neutral-400 underline"
                >
                  Start another {group.name}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <BigButton tone="quiet" onClick={() => setPicking(false)}>
        Cancel
      </BigButton>
    </div>
  );
}
