import type { ReactNode } from 'react';
import { SectionSwitcher } from './SectionSwitcher';

// One frame for every screen, so the gutters never shift as the app moves
// between them. Deliberately not Layout.astro: this window must not offer the
// site nav, whose links are for visitors and would turn the app into a
// browser. The way to the club app's other sections is the switcher, shown on
// the main screen (`switcher`).
export function Screen({ children, title, switcher = false }: { children: ReactNode; title?: string; switcher?: boolean }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-5 py-8">
      <header>
        <div className="flex items-center justify-between gap-4">
          {/* Served from /registrar/, so the service worker keeps it for a
              phone opened with no signal. */}
          <img src="/registrar/logo.jpg" alt="Omagh Harriers" width={428} height={167} className="h-8 w-auto" />
          {switcher && <SectionSwitcher />}
        </div>
        {title && <h1 className="mt-4 text-3xl font-bold text-white">{title}</h1>}
      </header>
      {children}
    </main>
  );
}

// Every tap target comes through here or matches it: at least 3.5rem tall, high
// contrast, no precision required. Cold fingers, floodlights, rain.
export function BigButton({
  children,
  onClick,
  href,
  tone = 'primary',
  disabled,
  submit = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  /** Submits the form it sits in, so the keyboard's Go key works too. */
  submit?: boolean;
  /**
   * `outline` is for an action that sits beside things to pick, such as the
   * session list's "Create a new session": transparent, so the sessions are
   * the only filled cards on the screen.
   */
  tone?: 'primary' | 'quiet' | 'outline';
  disabled?: boolean;
}) {
  const tones = {
    primary: 'bg-neutral-100 text-black active:bg-neutral-300',
    quiet: 'border border-neutral-800 bg-neutral-900 text-neutral-100 active:bg-neutral-800',
    outline: 'border border-neutral-700 bg-transparent text-neutral-200 active:bg-neutral-900',
  };
  const shared = `flex min-h-14 w-full items-center justify-center rounded-xl px-5 text-lg font-semibold transition-colors disabled:opacity-50 ${tones[tone]}`;

  if (href) {
    return (
      <a href={href} className={shared}>
        {children}
      </a>
    );
  }

  return (
    <button type={submit ? 'submit' : 'button'} onClick={onClick} disabled={disabled} className={shared}>
      {children}
    </button>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-base text-neutral-300">
      {children}
    </div>
  );
}

export function Problem({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl bg-red-950 px-4 py-3 text-base text-red-200">
      {children}
    </p>
  );
}
