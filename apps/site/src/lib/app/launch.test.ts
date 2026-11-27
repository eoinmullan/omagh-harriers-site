import { describe, expect, it } from 'vitest';
import {
  HELD_SECTIONS_KEY,
  LAST_SECTION_KEY,
  readRemembered,
  rememberSection,
  whereToLaunch,
  type KeyValueStore,
} from './launch';

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { values: Record<string, string> } {
  const values = { ...initial };
  return {
    values,
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => {
      values[key] = value;
    },
  };
}

const refusingStore: KeyValueStore = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('whereToLaunch', () => {
  it('opens Home the first time', () => {
    const launch = whereToLaunch({ last: undefined, held: [] }, true);

    expect(launch).toEqual({ goTo: '/members' });
  });

  it('opens the section used last', () => {
    const launch = whereToLaunch({ last: 'admin', held: ['home', 'registration', 'admin'] }, true);

    expect(launch).toEqual({ goTo: '/admin/sessions' });
  });

  it('opens Home when the section used last is no longer held', () => {
    const launch = whereToLaunch({ last: 'admin', held: ['home'] }, true);

    expect(launch).toEqual({ goTo: '/members' });
  });

  it('opens Registration with no signal for somebody who holds it, whatever was used last', () => {
    const launch = whereToLaunch({ last: 'admin', held: ['home', 'registration', 'admin'] }, false);

    expect(launch).toEqual({ goTo: '/registrar/' });
  });

  it('has nowhere to go with no signal for a member', () => {
    const launch = whereToLaunch({ last: 'home', held: ['home'] }, false);

    expect(launch).toEqual({ offline: true });
  });
});

describe('rememberSection and readRemembered', () => {
  it('reads back what was remembered', () => {
    const store = memoryStore();

    rememberSection(store, 'registration', ['home', 'registration']);
    const remembered = readRemembered(store);

    expect(remembered).toEqual({ last: 'registration', held: ['home', 'registration'] });
  });

  it('ignores a stored value it does not recognise', () => {
    const store = memoryStore({ [LAST_SECTION_KEY]: 'coach', [HELD_SECTIONS_KEY]: 'home coach' });

    const remembered = readRemembered(store);

    expect(remembered).toEqual({ last: undefined, held: ['home'] });
  });

  it('remembers nothing, without failing, on a phone that refuses storage', () => {
    rememberSection(refusingStore, 'admin', ['home', 'admin']);
    const remembered = readRemembered(refusingStore);

    expect(remembered).toEqual({ last: undefined, held: [] });
  });
});
