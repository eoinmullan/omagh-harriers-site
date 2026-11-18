import type { ReactNode } from 'react';

// One frame for every screen, so the gutters never shift as the app moves
// between them. Deliberately not Layout.astro: this window must not offer the
// site nav, because every one of those links is outside the manifest scope and
// would throw the registrar out of the app and into a browser.
export function Screen({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-5 py-8">
      <header>
        <p className="text-sm font-medium tracking-wide text-slate-400 uppercase">Omagh Harriers</p>
        {title && <h1 className="mt-1 text-3xl font-bold text-slate-50">{title}</h1>}
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
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  tone?: 'primary' | 'quiet';
  disabled?: boolean;
}) {
  const tones = {
    primary: 'bg-slate-50 text-slate-900 active:bg-slate-300',
    quiet: 'border border-edge bg-raised text-slate-100 active:bg-slate-700',
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
    <button type="button" onClick={onClick} disabled={disabled} className={shared}>
      {children}
    </button>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-edge bg-raised px-4 py-3 text-base text-slate-300">
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
