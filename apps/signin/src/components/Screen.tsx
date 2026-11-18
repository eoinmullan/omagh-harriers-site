import type { ReactNode } from 'react';

// One frame for every screen, so the gutters never shift as the app moves
// between them — the same reasoning as PageContainer.astro on the website.
export function Screen({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-5 py-8">
      <header>
        <p className="text-sm font-medium tracking-wide text-slate-400 uppercase">
          Omagh Harriers
        </p>
        {title && <h1 className="mt-1 text-3xl font-bold text-slate-50">{title}</h1>}
      </header>
      {children}
    </main>
  );
}
