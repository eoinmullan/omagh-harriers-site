import { createContext, useContext, useRef } from 'react';
import { switcherIsWorthShowing, type AppSection } from '../../lib/app/sections';
import { isStandalone } from './platform';

// The club app's section switcher, as the registrar draws it: the section's
// name at the top of today's list, opening a sheet of Home and each tool held.
// The server-drawn sections use components/app/SectionSwitcher.astro, to the
// same pattern. Shown only inside the app: in a browser the members' area
// cards are the way between them.

export const HeldSections = createContext<AppSection[]>([]);

export function SectionSwitcher() {
  const sections = useContext(HeldSections);
  const sheet = useRef<HTMLDialogElement>(null);

  if (!isStandalone() || !switcherIsWorthShowing(sections)) return null;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => sheet.current?.showModal()}
        className="-mr-2 inline-flex min-h-11 items-center gap-1.5 px-2 text-lg font-semibold text-amber"
      >
        Registration <span aria-hidden="true" className="text-sm">▾</span>
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
          {sections.map((section) => (
            <li key={section.key}>
              <a
                href={section.href}
                aria-current={section.key === 'registration' ? 'page' : undefined}
                className="flex min-h-14 items-center justify-between rounded-xl px-3 text-lg text-neutral-100 active:bg-neutral-900 aria-[current=page]:font-semibold"
              >
                {section.label}
                <span aria-hidden="true" className="text-neutral-400">
                  {section.key === 'registration' ? '✓' : '›'}
                </span>
              </a>
            </li>
          ))}
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
