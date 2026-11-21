import { describe, expect, it } from 'vitest';
import { balanceTone, bySurname, rosterToShow, toneWords, usualsFor, type RosterMember,
  householdNameToShow,
  householdsThatPaid,
} from './usuals';

function member(overrides: Partial<RosterMember> & { id: string }): RosterMember {
  return {
    firstName: 'Jack',
    surname: 'Ashby',
    principalId: 'household-1',
    ...overrides,
  };
}

const jack = member({ id: 'jack', firstName: 'Jack', surname: 'Ashby' });
const sophie = member({ id: 'sophie', firstName: 'Sophie', surname: 'Ashby' });
const kane = member({ id: 'kane', firstName: 'Orla', surname: "O'Kane", principalId: 'household-2' });
const burns = member({ id: 'burns', firstName: 'Siobhán', surname: 'Burns', principalId: 'household-3' });
const everyone = [kane, jack, burns, sophie];

describe('bySurname', () => {
  it('puts siblings next to each other, first names in order', () => {
    expect([...everyone].sort(bySurname).map((m) => m.id)).toEqual([
      'jack',
      'sophie',
      'burns',
      'kane',
    ]);
  });
});

describe('usualsFor', () => {
  it('starts from the squad, so the first night is not empty', () => {
    expect([...usualsFor({ inGroup: ['jack', 'sophie'] })].sort()).toEqual(['jack', 'sophie']);
  });

  it('learns from who has turned up to this group before', () => {
    const usuals = usualsFor({ inGroup: ['jack'], attendedBefore: ['kane'] });

    expect(usuals.has('kane')).toBe(true);
  });

  it('keeps somebody the registrar went and found, without a second control', () => {
    const usuals = usualsFor({ inGroup: ['jack'], present: ['burns'] });

    expect(usuals.has('burns')).toBe(true);
  });

  it('counts a runner once however many ways they qualify', () => {
    const usuals = usualsFor({
      inGroup: ['jack'],
      attendedBefore: ['jack'],
      present: ['jack'],
    });

    expect([...usuals]).toEqual(['jack']);
  });
});

describe('rosterToShow', () => {
  const usuals = new Set(['jack', 'sophie']);

  it('opens on the Usuals, not the whole club', () => {
    const shown = rosterToShow({ members: everyone, usuals, view: 'usuals' });

    expect(shown.map((m) => m.id)).toEqual(['jack', 'sophie']);
  });

  it('shows everyone when asked, still by surname', () => {
    const shown = rosterToShow({ members: everyone, usuals, view: 'everyone' });

    expect(shown.map((m) => m.id)).toEqual(['jack', 'sophie', 'burns', 'kane']);
  });

  it('searches the whole club even while the Usuals are showing', () => {
    const shown = rosterToShow({ members: everyone, usuals, view: 'usuals', term: 'kane' });

    expect(shown.map((m) => m.id)).toEqual(['kane']);
  });

  it('forgives the apostrophe somebody at a track will not type', () => {
    const shown = rosterToShow({ members: everyone, usuals, view: 'usuals', term: 'okane' });

    expect(shown.map((m) => m.id)).toEqual(['kane']);
  });

  it('forgives a fada a phone keyboard will not produce', () => {
    const shown = rosterToShow({ members: everyone, usuals, view: 'everyone', term: 'siobhan' });

    expect(shown.map((m) => m.id)).toEqual(['burns']);
  });

  it('matches anywhere in the name, not just the start', () => {
    const shown = rosterToShow({ members: everyone, usuals, view: 'everyone', term: 'shb' });

    expect(shown.map((m) => m.id)).toEqual(['jack', 'sophie']);
  });

  it('shows who is signed in, from the whole club', () => {
    const shown = rosterToShow({
      members: everyone,
      usuals,
      view: 'here',
      present: new Set(['kane', 'jack']),
    });

    expect(shown.map((m) => m.id)).toEqual(['jack', 'kane']);
  });

  it('shows everybody in a household that paid tonight', () => {
    const shown = rosterToShow({
      members: everyone,
      usuals,
      view: 'paid',
      paidHouseholds: new Set(['household-1']),
    });

    expect(shown.map((m) => m.id)).toEqual(['jack', 'sophie']);
  });

  it('draws no member rows on the guests view', () => {
    expect(rosterToShow({ members: everyone, usuals, view: 'guests' })).toEqual([]);
  });

  it('an empty search is not a search', () => {
    const shown = rosterToShow({ members: everyone, usuals, view: 'usuals', term: '   ' });

    expect(shown.map((m) => m.id)).toEqual(['jack', 'sophie']);
  });

  it('says nothing rather than everything when a search matches nobody', () => {
    const shown = rosterToShow({ members: everyone, usuals, view: 'everyone', term: 'zzz' });

    expect(shown).toEqual([]);
  });
});

describe('balanceTone', () => {
  it('is neutral with the night covered', () => {
    expect(balanceTone(800, 200)).toBe('credit');
  });

  it('is neutral with exactly the price left, because tonight is covered', () => {
    expect(balanceTone(200, 200)).toBe('credit');
  });

  it('warns below the price of a session, which is the tick about to be made', () => {
    expect(balanceTone(150, 200)).toBe('low');
  });

  it('warns at nothing left', () => {
    expect(balanceTone(0, 200)).toBe('low');
  });

  it('is red overdrawn', () => {
    expect(balanceTone(-200, 200)).toBe('overdrawn');
  });

  it('treats a free session as covered by any credit at all', () => {
    expect(balanceTone(0, 0)).toBe('credit');
  });
});

describe('toneWords', () => {
  it('says nothing for a household in credit, so the common case stays short', () => {
    expect(toneWords('credit')).toBeUndefined();
  });

  it('puts the warning colour into words for a screen reader', () => {
    expect(toneWords('low')).toBe("won't cover tonight");
    expect(toneWords('overdrawn')).toBe('overdrawn');
  });
});

describe('householdsThatPaid', () => {
  const kellys = [
    { id: 'noah', firstName: 'Noah', surname: 'Kelly', principalId: 'kelly' },
    { id: 'nori', firstName: 'Nori', surname: 'Kelly', principalId: 'kelly' },
    { id: 'tanya', firstName: 'Tanya', surname: 'Kelly', principalId: 'kelly' },
  ];
  const conway = { id: 'james', firstName: 'James', surname: 'Conway', principalId: 'conway' };
  const corrigan = { id: 'aodhan', firstName: 'Aodhan', surname: 'Corrigan', principalId: 'corrigan' };
  const cash: Record<string, number> = { kelly: 1000, corrigan: 500 };
  const names: Record<string, string> = { kelly: 'Tanya Kelly', corrigan: 'Una Corrigan', conway: 'Caroline Conway' };

  function paid(present: string[]) {
    return householdsThatPaid({
      members: [...kellys, conway, corrigan],
      present: new Set(present),
      cashFor: (id) => cash[id] ?? 0,
      nameOf: (id) => names[id] ?? '',
    });
  }

  it('is one row per household that paid, so the rows add up to what was taken', () => {
    const rows = paid(['noah']);

    expect(rows.map((row) => [row.name, row.cashPence])).toEqual([
      ['Tanya Kelly', 1000],
      ['Una Corrigan', 500],
    ]);
    expect(rows.reduce((total, row) => total + row.cashPence, 0)).toBe(1500);
  });

  it('names only the members signed in tonight', () => {
    const [kelly] = paid(['noah']);

    expect(kelly.here.map((member) => member.firstName)).toEqual(['Noah']);
  });

  it('keeps a household that paid with nobody from it signed in', () => {
    const corrigans = paid([]).find((row) => row.principalId === 'corrigan');

    expect(corrigans?.here).toEqual([]);
  });

  it('leaves out a household whose money was all handed back', () => {
    cash.conway = 0;

    expect(paid([]).some((row) => row.principalId === 'conway')).toBe(false);
  });
});

describe('householdNameToShow', () => {
  const phil = { id: 'phil', firstName: 'Phil', surname: 'Adams', principalId: 'adams' };

  it("names the household when it isn't the runner", () => {
    expect(householdNameToShow({ ...phil, firstName: 'Jos' }, 'Phil Adams')).toBe('Phil Adams');
  });

  it('leaves it off when the runner is the household contact', () => {
    expect(householdNameToShow(phil, 'Phil Adams')).toBeUndefined();
  });

  it('treats a different case as the same person', () => {
    expect(householdNameToShow(phil, 'phil adams')).toBeUndefined();
  });
});
