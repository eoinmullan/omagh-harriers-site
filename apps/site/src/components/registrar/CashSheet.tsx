import { useState } from 'react';
import { formatPounds } from '../../lib/credits/money';
import { appendDigit, dropDigit, QUICK_AMOUNTS_PENCE } from '../../lib/training/cash';

// What happens when a cash cell is tapped.
//
// The sheet names the household and who is in it, not the row that was tapped:
// £10 handed over for one of three siblings is one £10 going into one pot, and
// the registrar needs to see that rather than infer it.
//
// There is no confirm step beyond the one button. The figure on screen is what
// will be recorded, and getting it wrong is fixed by opening this again — the
// same principle as the tick.

export function CashSheet({
  householdName,
  memberNames,
  currentPence,
  onSave,
  onClose,
}: {
  householdName: string;
  memberNames: string[];
  currentPence: number;
  onSave: (targetPence: number) => void;
  onClose: () => void;
}) {
  const [pence, setPence] = useState(currentPence);
  const unchanged = pence === currentPence;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Cash from ${householdName}`}
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70"
    >
      {/* Tapping away closes without writing anything. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex-1 cursor-default"
      />

      <div className="rounded-t-2xl border-t border-edge bg-ground px-5 pt-5 pb-8">
        <h2 className="text-xl font-bold text-slate-50">{householdName}</h2>
        <p className="mt-0.5 text-base text-slate-400">{memberNames.join(' · ')}</p>

        <p className="mt-5 text-center text-5xl font-bold tabular-nums text-slate-50">
          {formatPounds(pence)}
        </p>
        <p className="mt-1 text-center text-sm text-slate-500">
          {currentPence > 0
            ? `Handed over tonight: ${formatPounds(currentPence)}`
            : 'Nothing handed over yet tonight'}
        </p>

        <div className="mt-5 grid grid-cols-4 gap-2">
          {QUICK_AMOUNTS_PENCE.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => setPence(amount)}
              className="min-h-14 rounded-xl border border-edge bg-raised text-lg font-semibold text-slate-100 active:bg-slate-700"
            >
              {formatPounds(amount)}
            </button>
          ))}
        </div>

        {/* Digits shift in from the right, so there is no decimal point to
            place with cold fingers. */}
        <div className="mt-2 grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => setPence((current) => appendDigit(current, digit))}
              className="min-h-14 rounded-xl border border-edge bg-raised text-2xl font-semibold text-slate-100 active:bg-slate-700"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPence(0)}
            className="min-h-14 rounded-xl border border-edge bg-raised text-base text-slate-300 active:bg-slate-700"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setPence((current) => appendDigit(current, '0'))}
            className="min-h-14 rounded-xl border border-edge bg-raised text-2xl font-semibold text-slate-100 active:bg-slate-700"
          >
            0
          </button>
          <button
            type="button"
            aria-label="Delete last digit"
            onClick={() => setPence(dropDigit)}
            className="min-h-14 rounded-xl border border-edge bg-raised text-2xl text-slate-100 active:bg-slate-700"
          >
            ⌫
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-14 flex-1 rounded-xl border border-edge bg-raised text-lg font-semibold text-slate-200 active:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={unchanged}
            onClick={() => onSave(pence)}
            className="min-h-14 flex-2 rounded-xl bg-slate-50 text-lg font-semibold text-slate-900 active:bg-slate-300 disabled:opacity-40"
          >
            {describeSave(currentPence, pence)}
          </button>
        </div>
      </div>
    </div>
  );
}

// The button says what it is about to do, so nothing has to be carried in the
// registrar's head between tapping an amount and tapping save.
function describeSave(currentPence: number, targetPence: number): string {
  if (targetPence === currentPence) return 'No change';
  if (targetPence === 0) return `Give back ${formatPounds(currentPence)}`;
  if (targetPence > currentPence) return `Take ${formatPounds(targetPence - currentPence)}`;
  return `Give back ${formatPounds(currentPence - targetPence)}`;
}
