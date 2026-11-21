import { useEffect, useRef, useState } from 'react';
import { cashLabel } from '../../lib/credits/cash-label';
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
  const dialog = useRef<HTMLDivElement>(null);
  const firstAmount = useRef<HTMLButtonElement>(null);

  // A modal dialog has to behave like one for a keyboard or a screen reader:
  // focus moves into it, stays in it, Escape closes it, and closing puts focus
  // back on the cash cell that opened it. Before this the sheet was marked up
  // as a modal and left focus on the row behind it. On a phone nothing
  // visible changes: focus set from code after a tap draws no ring.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    firstAmount.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    function keepFocusInside(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog.current) return;

      const stops = [...dialog.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
      const first = stops[0];
      const last = stops[stops.length - 1];
      const inside = dialog.current.contains(document.activeElement);

      if (!inside || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener('keydown', keepFocusInside);
    return () => document.removeEventListener('keydown', keepFocusInside);
  }, [onClose]);

  return (
    <div
      ref={dialog}
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

      <div className="rounded-t-2xl border-t border-neutral-800 bg-black px-5 pt-5 pb-8">
        <h2 className="text-xl font-bold text-white">{householdName} household</h2>
        <p className="mt-0.5 text-base text-neutral-400">{memberNames.join(' · ')}</p>

        <p className="mt-5 text-center text-5xl font-bold tabular-nums text-white">
          {formatPounds(pence)}
        </p>
        <p className="mt-1 text-center text-sm text-neutral-400">
          {currentPence > 0
            ? `Handed over tonight: ${cashLabel(currentPence)}`
            : 'Nothing handed over yet tonight'}
        </p>

        {/* The usual amounts are the big buttons: nearly everything handed over
            at a gate is one of them. The keypad below is for the rest, the
            preset-plus-other-amount pattern of every tip and donation screen. */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          {QUICK_AMOUNTS_PENCE.map((amount, index) => (
            <button
              key={amount}
              ref={index === 0 ? firstAmount : undefined}
              type="button"
              aria-pressed={pence === amount}
              onClick={() => setPence(amount)}
              className={`min-h-16 rounded-xl text-2xl font-bold ${
                pence === amount
                  ? 'bg-amber text-black'
                  : 'border border-neutral-700 bg-neutral-900 text-amber active:bg-neutral-800'
              }`}
            >
              {cashLabel(amount)}
            </button>
          ))}
        </div>

        {/* Digits shift in from the right, so there is no decimal point to
            place with cold fingers. */}
        <p className="mt-4 text-xs font-semibold tracking-wide text-neutral-400 uppercase">Other amount</p>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => setPence((current) => appendDigit(current, digit))}
              className="min-h-11 rounded-lg border border-neutral-800 bg-neutral-900 text-lg font-semibold text-neutral-100 active:bg-neutral-800"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPence(0)}
            className="min-h-11 rounded-lg border border-neutral-800 bg-neutral-900 text-sm text-neutral-300 active:bg-neutral-800"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setPence((current) => appendDigit(current, '0'))}
            className="min-h-11 rounded-lg border border-neutral-800 bg-neutral-900 text-lg font-semibold text-neutral-100 active:bg-neutral-800"
          >
            0
          </button>
          <button
            type="button"
            aria-label="Delete last digit"
            onClick={() => setPence(dropDigit)}
            className="min-h-11 rounded-lg border border-neutral-800 bg-neutral-900 text-lg text-neutral-100 active:bg-neutral-800"
          >
            ⌫
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-14 flex-1 rounded-xl border border-neutral-800 bg-neutral-900 text-lg font-semibold text-neutral-200 active:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={unchanged}
            onClick={() => onSave(pence)}
            className="min-h-14 flex-2 rounded-xl bg-neutral-100 text-lg font-semibold text-black active:bg-neutral-300 disabled:opacity-40"
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
  if (targetPence === 0) return `Give back ${cashLabel(currentPence)}`;
  if (targetPence > currentPence) return `Take ${cashLabel(targetPence - currentPence)}`;
  return `Give back ${cashLabel(currentPence - targetPence)}`;
}
