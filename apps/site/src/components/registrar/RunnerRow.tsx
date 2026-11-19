import { formatBalance } from '../../lib/credits/money';
import type { Household } from '../../lib/training/night';
import { balanceTone, type RosterMember } from '../../lib/training/usuals';

// One runner, and the whole of their state is on the row being looked at.
//
// There is no undo button anywhere in this app. A floating undo is a second
// affordance with its own timeout, pointing at a row that has already scrolled
// away. The control that did the thing is the thing that shows it, and using it
// again reverses it — which is also why the checkbox is the whole row rather
// than a small square beside it.

export function RunnerRow({
  member,
  household,
  pricePence,
  isHere,
  isSaving,
  onToggle,
}: {
  member: RosterMember;
  household: Household | undefined;
  pricePence: number;
  isHere: boolean;
  isSaving: boolean;
  onToggle: () => void;
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
    <button
      type="button"
      role="checkbox"
      aria-checked={isHere}
      onClick={onToggle}
      disabled={isSaving}
      className={`flex min-h-18 w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition-colors ${
        isHere
          ? 'border-emerald-500/60 bg-emerald-500/10 active:bg-emerald-500/20'
          : 'border-edge bg-raised active:bg-slate-700'
      } ${isSaving ? 'opacity-60' : ''}`}
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
  );
}
