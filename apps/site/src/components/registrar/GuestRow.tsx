import { formatPounds } from '../../lib/credits/money';
import type { Guest } from '../../lib/training/guests';

// A guest's row carries no money control.
//
// Ticking them in takes the session price in cash and that is the whole
// transaction — there is nothing to add funds to, because they hold no credit
// to add them to. The figure beside the name states what they paid and cannot
// be edited; a wrong tick is cleared by unticking, which takes the attendance
// row and the cash with it.

export function GuestRow({
  guest,
  pricePence,
  isHere,
  isSaving,
  onToggle,
}: {
  guest: Guest;
  pricePence: number;
  isHere: boolean;
  isSaving: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isHere}
      aria-label={`${guest.firstName} ${guest.surname}, guest`}
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
          {guest.surname}, {guest.firstName}
        </span>
        <span className="block truncate text-base text-slate-400">
          Guest{isHere && pricePence > 0 ? ` · paid ${formatPounds(pricePence)}` : ''}
        </span>
      </span>
    </button>
  );
}
