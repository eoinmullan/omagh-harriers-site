import { useState } from 'react';
import { likelyAlready, type Guest } from '../../lib/training/guests';
import { BigButton, Note } from './ui';

// Adding somebody nobody has seen before — and, more importantly, not adding
// somebody who is already on file.
//
// The table deliberately has no uniqueness on names, because two genuine Jack
// Kellys would collide and a constraint violation in front of a queue is the
// exact failure this phase exists to avoid. Keeping one person from becoming
// three spellings over a season is this screen's job instead: anyone matching
// what is being typed is offered as a tap, before Add is ever reached.

export function AddGuest({
  guests,
  onPick,
  onAdd,
  problem,
}: {
  guests: Guest[];
  onPick: (guest: Guest) => void;
  onAdd: (firstName: string, surname: string) => void;
  problem: string | null;
}) {
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');

  const already = likelyAlready(guests, firstName, surname);
  const ready = firstName.trim() !== '' && surname.trim() !== '';

  const field = 'min-h-14 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 text-lg text-white placeholder:text-neutral-400';

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <p className="text-base font-semibold text-neutral-200">Someone new</p>

      <div className="flex gap-2">
        <input
          type="text"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          placeholder="First name"
          autoComplete="off"
          autoCapitalize="words"
          aria-label="Guest first name"
          className={field}
        />
        <input
          type="text"
          value={surname}
          onChange={(event) => setSurname(event.target.value)}
          placeholder="Surname"
          autoComplete="off"
          autoCapitalize="words"
          aria-label="Guest surname"
          className={field}
        />
      </div>

      {already.length > 0 && (
        <Note>
          <p className="mb-2">Already on file — tap rather than add again:</p>
          <ul className="flex flex-col gap-2">
            {already.map((guest) => (
              <li key={guest.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(guest);
                    setFirstName('');
                    setSurname('');
                  }}
                  className="min-h-12 w-full rounded-lg border border-neutral-800 bg-black px-3 text-left text-lg text-neutral-100 active:bg-neutral-800"
                >
                  {guest.firstName} {guest.surname}
                </button>
              </li>
            ))}
          </ul>
        </Note>
      )}

      {problem && <p className="text-base text-red-300">{problem}</p>}

      <BigButton
        tone="quiet"
        disabled={!ready}
        onClick={() => {
          onAdd(firstName, surname);
          setFirstName('');
          setSurname('');
        }}
      >
        {already.length > 0 ? 'Add anyway' : 'Add guest'}
      </BigButton>
    </div>
  );
}
