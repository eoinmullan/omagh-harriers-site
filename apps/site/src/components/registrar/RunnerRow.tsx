import { formatBalance, formatPounds } from '../../lib/credits/money';
import type { Household } from '../../lib/training/night';
import { balanceTone, type RosterMember } from '../../lib/training/usuals';

// One runner, and the whole of their state is on the row being looked at.
//
// There is no undo button anywhere in this app. A floating undo is a second
// affordance with its own timeout, pointing at a row that has already scrolled
// away. The control that did the thing is the thing that shows it, and using it
// again reverses it.
//
// Two controls, side by side and never nested: the attendance half is a
// checkbox, and the cash cell is both control and display — `+ £` when nothing
// has been taken from that household tonight, the figure itself once something
// has.

export function RunnerRow({
  member,
  household,
  pricePence,
  cashPence,
  isHere,
  isSaving,
  onToggle,
  onCash,
}: {
  member: RosterMember;
  household: Household | undefined;
  pricePence: number;
  cashPence: number;
  isHere: boolean;
  isSaving: boolean;
  onToggle: () => void;
  onCash: () => void;
}) {
  const tone = household ? balanceTone(household.balancePence, pricePence) : 'credit';

  // Colour carries the warning, not the wording. A line whose words change with
  // the number is a line the registrar has to read rather than glance at.
  const tones = {
    credit: 'text-slate-400',
    low: 'text-amber-400',
    overdrawn: 'text-red-400',
  };

  return (
    <div
      className={`flex items-stretch gap-px overflow-hidden rounded-xl border ${
        isHere ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-edge bg-raised'
      } ${isSaving ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={isHere}
        aria-label={`${member.firstName} ${member.surname}`}
        onClick={onToggle}
        disabled={isSaving}
        // min-w-0 or this never shrinks: a flex item defaults to
        // min-width:auto, so a long household name holds the button at its
        // content width and pushes the cash cell out past overflow-hidden,
        // where it is clipped away entirely but still in the a11y tree.
        className="flex min-h-18 min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left transition-colors active:bg-slate-700/40"
      >
        <span
          aria-hidden="true"
          className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 text-lg font-bold ${
            isHere ? 'border-emerald-400 bg-emerald-400 text-slate-900' : 'border-slate-500'
          }`}
        >
          {isHere ? '✓' : ''}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-xl font-semibold text-slate-50">
            {member.surname}, {member.firstName}
          </span>
          {household && (
            <span className={`block truncate text-base ${tones[tone]}`}>
              {formatBalance(household.balancePence)} · {household.name}
            </span>
          )}
        </span>
      </button>

      <button
        type="button"
        onClick={onCash}
        aria-label={
          cashPence > 0
            ? `Cash from ${household?.name ?? 'this household'}: ${formatPounds(cashPence)}`
            : `Take cash from ${household?.name ?? 'this household'}`
        }
        className={`flex min-h-18 w-20 shrink-0 items-center justify-center border-l border-edge text-lg font-semibold transition-colors active:bg-slate-700 ${
          cashPence > 0 ? 'bg-emerald-500/15 text-emerald-200' : 'text-slate-400'
        }`}
      >
        {cashPence > 0 ? formatPounds(cashPence) : '+ £'}
      </button>
    </div>
  );
}
