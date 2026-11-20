import { describe, expect, it } from 'vitest';
import { safeToRefresh, type Conditions } from './watching';

function conditions(overrides: Partial<Conditions> = {}): Conditions {
  return { online: true, pending: 0, busy: false, visible: true, ...overrides };
}

describe('safeToRefresh', () => {
  it('takes the other phone’s word when this one owes nothing', () => {
    expect(safeToRefresh(conditions())).toBe(true);
  });

  it('refuses while this phone is holding a write, so a tick never vanishes under the registrar', () => {
    expect(safeToRefresh(conditions({ pending: 1 }))).toBe(false);
  });

  it('refuses offline, where the database has nothing to say', () => {
    expect(safeToRefresh(conditions({ online: false }))).toBe(false);
  });

  it('refuses while a sheet is open, because the figure being typed is not on screen to be replaced', () => {
    expect(safeToRefresh(conditions({ busy: true }))).toBe(false);
  });

  it('refuses while the app is in the background, where nobody is looking', () => {
    expect(safeToRefresh(conditions({ visible: false }))).toBe(false);
  });

  it('needs every condition, not just the obvious one', () => {
    expect(safeToRefresh(conditions({ online: false, pending: 0 }))).toBe(false);
    expect(safeToRefresh(conditions({ busy: true, pending: 0 }))).toBe(false);
  });
});
