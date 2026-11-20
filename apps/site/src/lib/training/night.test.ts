import { describe, expect, it } from 'vitest';
import { flip, headcount, type NightState } from './night';

const ASHBY = 'household-ashby';

function night(overrides: Partial<NightState> = {}): NightState {
  return {
    households: new Map([[ASHBY, { name: 'Ash Ashby', balancePence: 800 }]]),
    here: new Map(),
    ...overrides,
  };
}

const tap = {
  memberId: 'jack',
  principalId: ASHBY,
  wasHere: false,
  pricePence: 200,
  attendanceId: 'attendance-new',
};
const untap = { ...tap, wasHere: true };

describe('flip', () => {
  it('marks a runner here and takes the session out of the pot at once', () => {
    const after = flip(night(), tap);

    expect(after.here.get('jack')).toBe('attendance-new');
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

