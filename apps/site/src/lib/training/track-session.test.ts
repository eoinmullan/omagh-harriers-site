import { describe, expect, it } from 'vitest';
import { alreadyOnTonight, planTrackSession } from './track-session';
import type { SelectableSession } from './tonight';

const endurance = { id: 'group-endurance', name: 'Endurance' };
const mondayEvening = new Date('2026-11-19T19:00:00.000Z');

function session(overrides: Partial<SelectableSession> = {}): SelectableSession {
  return {
    id: 's1',
    startsAt: '2026-11-19T19:00:00.000Z',
    note: null,
    pricePence: 200,
    isCancelled: false,
    groupId: 'group-endurance',
    groupName: 'Endurance',
    ...overrides,
  };
}

describe('planTrackSession', () => {
  const plan = () =>
    planTrackSession({
      group: endurance,
      createdBy: 'registrar-1',
      id: 'client-made-id',
      now: mondayEvening,
    });

  it('uses the id the phone minted, so a retry is one session not two', () => {
    expect(plan().id).toBe('client-made-id');
  });

  it('is for the squad that was picked, which is the whole of what it is called', () => {
    expect(plan().group_id).toBe('group-endurance');
  });

  it('starts now, because that is where the runners are', () => {
    expect(plan().starts_at).toBe('2026-11-19T19:00:00.000Z');
  });

  it('takes the usual price, which a registrar cannot change', () => {
    expect(plan().price_pence).toBe(200);
  });

  it('names who started it', () => {
    expect(plan().created_by).toBe('registrar-1');
  });

  it('carries no note, there being nothing to say about a session nobody planned', () => {
    expect(plan().is_cancelled).toBeUndefined();
    expect(plan().note).toBeUndefined();
  });
});

describe('alreadyOnTonight', () => {
  it('names a session the other phone has already started for this group', () => {
    const found = alreadyOnTonight([session()], 'group-endurance', mondayEvening);

    expect(found.map((s) => s.id)).toEqual(['s1']);
  });

  it('says nothing about a different group', () => {
    expect(alreadyOnTonight([session()], 'group-sprints', mondayEvening)).toEqual([]);
  });

  it('ignores a session that was called off', () => {
    const off = session({ isCancelled: true });

    expect(alreadyOnTonight([off], 'group-endurance', mondayEvening)).toEqual([]);
  });

  it('ignores last Monday, which is a different night entirely', () => {
    const lastWeek = session({ startsAt: '2026-11-12T19:00:00.000Z' });

    expect(alreadyOnTonight([lastWeek], 'group-endurance', mondayEvening)).toEqual([]);
  });

  it('counts a late finish as tonight, on Omagh clocks', () => {
    const late = session({ startsAt: '2026-11-19T22:45:00.000Z' });

    expect(alreadyOnTonight([late], 'group-endurance', mondayEvening).map((s) => s.id)).toEqual([
      's1',
    ]);
  });

  it('finds both when a group genuinely trains twice, rather than picking one', () => {
    const morning = session({ id: 'morning', startsAt: '2026-11-19T09:00:00.000Z' });
    const found = alreadyOnTonight([morning, session()], 'group-endurance', mondayEvening);

    expect(found.map((s) => s.id)).toEqual(['morning', 's1']);
  });

  it('has nothing to warn about on a night with no sessions', () => {
    expect(alreadyOnTonight([], 'group-endurance', mondayEvening)).toEqual([]);
  });
});
