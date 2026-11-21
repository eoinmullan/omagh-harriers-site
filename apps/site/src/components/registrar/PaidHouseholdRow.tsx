import { cashLabel } from '../../lib/credits/cash-label';
import type { PaidHousehold } from '../../lib/training/usuals';

// A row of the Paid view: one household and what it handed over tonight.
//
// The view checks the tin, so it lists households, not runners, and its rows
// add up to the figure in the header (householdsThatPaid in usuals.ts). Who
// from the household is signed in is said underneath, because a household can
// pay for a child who's here and a sibling who isn't, or settle up with nobody
// training at all. The cash cell is the same as a runner's and opens the same
// sheet. There's no tick: ticking is the runner list's job.

export function PaidHouseholdRow({ household, onCash }: { household: PaidHousehold; onCash: () => void }) {
  const signedIn =
    household.here.length > 0
      ? `${household.here.map((member) => member.firstName).join(', ')} signed in`
      : 'Nobody from this household signed in';

  return (
    <li className="flex items-stretch border-b border-neutral-800">
      <div className="flex min-h-[76px] min-w-0 flex-1 flex-col justify-center px-4 py-3">
        <span className="block truncate text-lg leading-tight font-bold">{household.name}</span>
        <span className="block truncate text-sm text-neutral-400">{signedIn}</span>
      </div>

      <button
        type="button"
        onClick={onCash}
        aria-label={`Cash from ${household.name}: ${cashLabel(household.cashPence)}`}
        className="flex w-[72px] shrink-0 flex-col items-center justify-center border-l border-neutral-800 bg-amber/10 leading-none active:bg-neutral-800"
      >
        <span className="text-base font-bold text-amber">{cashLabel(household.cashPence)}</span>
        <span className="mt-1 block text-[11px] tracking-wider text-neutral-400 uppercase">added</span>
      </button>
    </li>
  );
}
