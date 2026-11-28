import { sectionByKey, type AppSection, type SectionKey } from './sections';

// What the app's icon opens. The icon lands on a small prerendered launch page,
// because Home and Admin are drawn by the server and a server page tapped with
// no signal is the phone's own error screen. The launch page always opens, and
// sends the person on from there.

/** Kept on the phone for good: the app never clears it. */
export const LAST_SECTION_KEY = 'harriers:last-section';
/** The sections this phone's login held when it last opened one. */
export const HELD_SECTIONS_KEY = 'harriers:held-sections';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// Reaching for localStorage itself can throw in a locked-down browser, so it's
// looked up on each call, inside the callers' try.
export const phoneStore: KeyValueStore = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};

export type Launch = { goTo: string } | { choose: AppSection[] } | { offline: true };

export interface Remembered {
  last: SectionKey | undefined;
  held: SectionKey[];
}

// Offline, Emergency contacts comes first: somebody reaching for it may be
// with an injured child.
const OFFLINE_ORDER: SectionKey[] = ['emergency', 'registration'];

/**
 * Online, the section used last, if the person still holds it, or Home.
 * Offline, only the sections that open with no signal: straight into the one
 * they hold, a choice when they hold both, and the launch page's own message
 * when they hold neither.
 */
export function whereToLaunch(remembered: Remembered, online: boolean): Launch {
  if (!online) {
    const offline = OFFLINE_ORDER.filter((key) => remembered.held.includes(key)).map((key) => sectionByKey(key)!);
    if (offline.length === 0) return { offline: true };
    if (offline.length === 1) return { goTo: offline[0]!.href };
    return { choose: offline };
  }
  const last = remembered.last && remembered.held.includes(remembered.last) ? remembered.last : 'home';
  return { goTo: sectionHref(last) };
}

export function rememberSection(store: KeyValueStore, current: SectionKey, held: readonly SectionKey[]): void {
  try {
    store.setItem(LAST_SECTION_KEY, current);
    store.setItem(HELD_SECTIONS_KEY, held.join(' '));
  } catch {
    // A phone refusing storage still opens the app, on Home.
  }
}

export function readRemembered(store: KeyValueStore): Remembered {
  try {
    const last = sectionByKey(store.getItem(LAST_SECTION_KEY))?.key;
    const held = (store.getItem(HELD_SECTIONS_KEY) ?? '')
      .split(' ')
      .map((key) => sectionByKey(key)?.key)
      .filter((key): key is SectionKey => key !== undefined);
    return { last, held };
  } catch {
    return { last: undefined, held: [] };
  }
}

function sectionHref(key: SectionKey): string {
  return sectionByKey(key)!.href;
}
