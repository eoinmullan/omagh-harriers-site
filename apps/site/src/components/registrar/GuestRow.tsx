import { cashLabel } from '../../lib/credits/cash-label';
import type { Guest } from '../../lib/training/guests';

// A guest's row carries no money control.
//
// Ticking them in takes the session price and that is the whole transaction —
// there is nothing to add funds to, because they hold no credit to add them to.
// The cell states what they paid and cannot be tapped; a wrong tick is cleared
// by unticking, which takes the attendance row and the cash with it.

export function GuestRow({
  guest,
  pricePence,
  isHere,
  onToggle,
}: {
  guest: Guest;
  pricePence: number;
  isHere: boolean;
  onToggle: () => void;
}) {
  const paid = isHere && pricePence > 0;

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
        aria-label={`${guest.firstName} ${guest.surname}, guest`}
        onClick={onToggle}
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
          <span className="block truncate text-lg leading-tight">
            <span className="font-bold tracking-wide uppercase">{guest.surname}</span>
            {', '}
            <span className="font-normal">{guest.firstName}</span>
          </span>
          <span className="block truncate text-sm text-neutral-400">
            Guest — holds no credit
          </span>
        </span>
      </button>

      {/* Not a button: there is nothing here to tap. */}
      <div
        className={`flex w-[72px] shrink-0 flex-col items-center justify-center border-l border-neutral-800 leading-none ${
          paid ? 'bg-amber/10' : ''
        }`}
      >
        {paid && (
          <>
            <span className="text-base font-bold text-amber">{cashLabel(pricePence)}</span>
            <span className="mt-1 block text-[11px] tracking-wider text-neutral-400 uppercase">
              paid
            </span>
          </>
        )}
      </div>
    </li>
  );
}
