import { describe, expect, it } from 'vitest';
import {
  flip,
  headcount,
  isSettled,
  PENDING,
  restore,
  settle,
  type NightState,
} from './night';

const ASHBY = 'household-ashby';

function night(overrides: Partial<NightState> = {}): NightState {
  return {
    households: new Map([[ASHBY, { name: 'Ash Ashby', balancePence: 800 }]]),
    here: new Map(),
    ...overrides,
  };
}

const tap = { memberId: 'jack', principalId: ASHBY, wasHere: false, pricePence: 200 };
const untap = { ...tap, wasHere: true };

describe('flip', () => {
  it('marks a runner here and takes the session out of the pot at once', () => {
    const after = flip(night(), tap);

    expect(after.here.get('jack')).toBe(PENDING);
    expect(after.households.get(ASHBY)?.balancePence).toBe(600);
  });

  it('unticking puts the money back', () => {
    const before = night({ here: new Map([['jack', 'attendance-1']]) });
    const after = flip(before, untap);

    expect(after.here.has('jack')).toBe(false);
    expect(after.households.get(ASHBY)?.balancePence).toBe(1000);
  });

  it('drains one pot as siblings are signed in, because the credit is shared', () => {
    const sophie = { ...tap, memberId: 'sophie' };
    const after = flip(flip(night(), tap), sophie);

    expect(after.households.get(ASHBY)?.balancePence).toBe(400);
    expect(headcount(after)).toBe(2);
  });

  it('leaves the pot alone for a free session', () => {
    const after = flip(night(), { ...tap, pricePence: 0 });

    expect(after.here.has('jack')).toBe(true);
    expect(after.households.get(ASHBY)?.balancePence).toBe(800);
  });

  it('lets a balance go negative rather than refusing the tick', () => {
    const broke = night({ households: new Map([[ASHBY, { name: 'Ash Ashby', balancePence: 0 }]]) });

    expect(flip(broke, tap).households.get(ASHBY)?.balancePence).toBe(-200);
  });

  it('does not mutate what it was given', () => {
    const before = night();
    flip(before, tap);

    expect(before.here.size).toBe(0);
    expect(before.households.get(ASHBY)?.balancePence).toBe(800);
  });

  it('copes with a runner whose household it has never heard of', () => {
    const after = flip(night(), { ...tap, principalId: 'unknown' });

    expect(after.here.has('jack')).toBe(true);
    expect(after.households.get(ASHBY)?.balancePence).toBe(800);
  });
});

describe('restore', () => {
  it('takes back a failed tick, pot and all', () => {
    const after = restore(flip(night(), tap), tap);

    expect(after.here.has('jack')).toBe(false);
    expect(after.households.get(ASHBY)?.balancePence).toBe(800);
  });

  it('puts back the attendance id a failed untick needs', () => {
    const before = night({ here: new Map([['jack', 'attendance-1']]) });
    const after = restore(flip(before, untap), { ...untap, attendanceId: 'attendance-1' });

    expect(after.here.get('jack')).toBe('attendance-1');
    expect(after.households.get(ASHBY)?.balancePence).toBe(800);
  });

  it('is the exact inverse of flip, both ways round', () => {
    const start = night({ here: new Map([['jack', 'attendance-1']]) });

    expect(restore(flip(start, untap), { ...untap, attendanceId: 'attendance-1' })).toEqual(start);
    expect(restore(flip(night(), tap), tap)).toEqual(night());
  });
});

describe('settle', () => {
  it('swaps the placeholder for the id an untick will need', () => {
    const after = settle(flip(night(), tap), { memberId: 'jack', attendanceId: 'attendance-9' });

    expect(after.here.get('jack')).toBe('attendance-9');
  });

  it('leaves the pot alone — the money moved when the row did', () => {
    const after = settle(flip(night(), tap), { memberId: 'jack', attendanceId: 'attendance-9' });

    expect(after.households.get(ASHBY)?.balancePence).toBe(600);
  });

  it('ignores a write landing for a row the registrar has since unticked', () => {
    const unticked = flip(flip(night(), tap), { ...untap, memberId: 'jack' });
    const after = settle(unticked, { memberId: 'jack', attendanceId: 'attendance-9' });

    expect(after.here.has('jack')).toBe(false);
  });
});

describe('isSettled', () => {
  it('is false while the write is still in flight, so there is nothing to undo', () => {
    expect(isSettled(flip(night(), tap), 'jack')).toBe(false);
  });

  it('is true once the real id is in', () => {
    const after = settle(flip(night(), tap), { memberId: 'jack', attendanceId: 'attendance-9' });

    expect(isSettled(after, 'jack')).toBe(true);
  });

  it('is false for somebody who is not here', () => {
    expect(isSettled(night(), 'jack')).toBe(false);
  });
});
