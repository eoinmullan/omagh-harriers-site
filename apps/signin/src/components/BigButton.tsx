import type { ReactNode } from 'react';

// Every tap target in the app comes through here or matches it: at least 3.5rem
// tall, high contrast, and no precision required. Cold fingers, floodlights,
// rain.
export function BigButton({
  children,
  onClick,
  type = 'button',
  tone = 'primary',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  tone?: 'primary' | 'quiet';
  disabled?: boolean;
}) {
  const tones = {
    primary: 'bg-slate-50 text-slate-900 active:bg-slate-300',
    quiet: 'border border-edge bg-raised text-slate-100 active:bg-slate-700',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`min-h-14 w-full rounded-xl px-5 text-lg font-semibold transition-colors disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}
