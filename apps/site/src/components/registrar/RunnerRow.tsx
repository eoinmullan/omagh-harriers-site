import { useId } from 'react';
import { cashLabel } from '../../lib/credits/cash-label';
import { formatBalance } from '../../lib/credits/money';
import type { Household } from '../../lib/training/night';
import { balanceTone, toneWords, type RosterMember } from '../../lib/training/usuals';

// One runner, and the whole of their state is on the row being looked at.
//
// There is no undo button anywhere in this app. A floating undo is a second
// affordance with its own timeout, pointing at a row that has already scrolled
// away. The control that did the thing is the thing that shows it, and using it
// again reverses it.
//
// Two controls, side by side and never nested: the attendance half is a
// checkbox, and the cash cell is both control and display.

export function RunnerRow({
  member,
  household,
  pricePence,
  cashPence,
  isHere,
  onToggle,
  onCash,
}: {
  member: RosterMember;
  household: Household | undefined;
  pricePence: number;
  cashPence: number;
  isHere: boolean;
  onToggle: () => void;
  onCash: () => void;
}) {
  const tone = household ? balanceTone(household.balancePence, pricePence) : 'credit';
  const spokenTone = toneWords(tone);
  const balanceId = useId();

  // Colour carries the warning, not the wording. A line whose words change with
  // the number is a line the registrar has to read rather than glance at.
  const tones = {
    credit: 'text-neutral-400',
    low: 'text-amber',
    overdrawn: 'text-red-400',
  };

  return (
    <li
      className={`flex items-stretch border-b border-neutral-800 ${
        isHere ? 'bg-emerald-950/60' : ''
      }`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={isHere}
        aria-label={`${member.firstName} ${member.surname}`}
        // The label is the name alone, and a label replaces the button's
        // contents. So the balance line describes it, or a screen reader would
        // never hear the balance, the household or the warning.
        aria-describedby={household ? balanceId : undefined}
        onClick={onToggle}
        // min-w-0 or this never shrinks: a flex item defaults to
        // min-width:auto, so a long household name holds the button at its
        // content width and pushes the cash cell out past the row's edge.
        className="flex min-h-[76px] min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left active:bg-neutral-800"
      >
        <span
          aria-hidden="true"
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg border-2 text-xl font-black ${
            isHere ? 'border-amber bg-amber text-black' : 'border-neutral-600 text-transparent'
          }`}
        >
          ✓
        </span>

        <span className="min-w-0">
          {/* The surname carries the weight: finding one name among three
              hundred is the job, so the half being scanned for is the half
              that stands out. */}
          <span className="block truncate text-lg leading-tight">
            <span className="font-bold tracking-wide uppercase">{member.surname}</span>
            {', '}
            <span className="font-normal">{member.firstName}</span>
          </span>
          {household && (
            <span id={balanceId} className={`block truncate text-sm ${tones[tone]}`}>
              {formatBalance(household.balancePence)}
              {spokenTone && <span className="sr-only"> {spokenTone}</span>} · {household.name}
            </span>
          )}
        </span>
      </button>

      <button
        type="button"
        onClick={onCash}
        aria-label={
          cashPence > 0
            ? `Cash from ${household?.name ?? 'this household'}: ${cashLabel(cashPence)}`
            : `Take cash from ${household?.name ?? 'this household'}`
        }
        className={`flex w-[72px] shrink-0 flex-col items-center justify-center border-l border-neutral-800 leading-none active:bg-neutral-800 ${
          cashPence > 0 ? 'bg-amber/10' : ''
        }`}
      >
        {cashPence > 0 ? (
          <>
            <span className="text-base font-bold text-amber">{cashLabel(cashPence)}</span>
            <span className="mt-1 block text-[11px] tracking-wider text-neutral-400 uppercase">
              added
            </span>
          </>
        ) : (
          <span className="text-sm text-neutral-400">+&nbsp;£</span>
        )}
      </button>
    </li>
  );
}
