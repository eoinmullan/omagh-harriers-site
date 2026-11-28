import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { switcherIsWorthShowing, type AppSection, type SectionKey } from '../../lib/app/sections';
import { isStandalone } from '../registrar/platform';

// The club app's section switcher, as the offline sections draw it: the
// section's name at the top of its main screen, opening a sheet of Home and
// each tool held. The server-drawn sections use SectionSwitcher.astro, to the
// same pattern. Shown only inside the app: in a browser the members' area
// cards are the way between them.
//
// With no signal, the sections that need one say so rather than leading to the
// phone's own error page. On a narrow phone the button uses the section's
// short name; the sheet always says the full one.

export const HeldSections = createContext<AppSection[]>([]);

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

export function SectionSwitcher({ current }: { current: SectionKey }) {
  const sections = useContext(HeldSections);
  const sheet = useRef<HTMLDialogElement>(null);
  const online = useOnline();

  if (!isStandalone() || !switcherIsWorthShowing(sections)) return null;
  const here = sections.find((section) => section.key === current);
  if (!here) return null;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`${here.label}: switch section`}
        onClick={() => sheet.current?.showModal()}
        className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-2 text-lg font-semibold text-amber"
      >
        <span className="hidden min-[360px]:inline">{here.label}</span>
        <span className="min-[360px]:hidden">{here.shortLabel}</span>
        <span aria-hidden="true" className="text-sm">▾</span>
      </button>
      <dialog
        ref={sheet}
        aria-label="Switch section"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-0 mt-auto w-full max-w-none rounded-t-2xl border-t border-neutral-800 bg-neutral-950 p-0 pb-[env(safe-area-inset-bottom)] text-white backdrop:bg-black/70"
      >
        <ul className="px-3 pt-4">
          {sections.map((section) => {
            const unreachable = !online && !section.worksOffline;
            return (
              <li key={section.key}>
                {unreachable ? (
                  <span className="flex min-h-14 items-center justify-between rounded-xl px-3 text-lg text-neutral-400">
                    {section.label}
                    <span className="text-sm">needs signal</span>
                  </span>
                ) : (
                  <a
                    href={section.href}
                    aria-current={section.key === current ? 'page' : undefined}
                    className="flex min-h-14 items-center justify-between rounded-xl px-3 text-lg text-neutral-100 active:bg-neutral-900 aria-[current=page]:font-semibold"
                  >
                    {section.label}
                    <span aria-hidden="true" className="text-neutral-400">
                      {section.key === current ? '✓' : '›'}
                    </span>
                  </a>
                )}
              </li>
            );
          })}
        </ul>
        <div className="px-5 pb-5 pt-2">
          <button
            type="button"
            onClick={() => sheet.current?.close()}
            className="flex min-h-14 w-full items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 px-5 text-lg font-semibold text-neutral-100 active:bg-neutral-800"
          >
            Close
          </button>
        </div>
      </dialog>
    </>
  );
}
