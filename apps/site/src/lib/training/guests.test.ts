import { describe, expect, it } from 'vitest';
import { guestsToShow, likelyAlready, planNewGuest, type Guest } from './guests';

const kelly: Guest = { id: 'g1', firstName: 'Jack', surname: 'Kelly' };
const okane: Guest = { id: 'g2', firstName: 'Orla', surname: "O'Kane" };
const burns: Guest = { id: 'g3', firstName: 'Siobhán', surname: 'Burns' };
const otherKelly: Guest = { id: 'g4', firstName: 'Jack', surname: 'Kelly' };
const everyone = [okane, kelly, burns];

describe('guestsToShow', () => {
  it('orders by surname, like everyone else on the screen', () => {
    expect(guestsToShow(everyone).map((g) => g.id)).toEqual(['g3', 'g1', 'g2']);
  });

  it('forgives the apostrophe', () => {
    expect(guestsToShow(everyone, 'okane').map((g) => g.id)).toEqual(['g2']);
  });

  it('forgives a fada', () => {
    expect(guestsToShow(everyone, 'siobhan').map((g) => g.id)).toEqual(['g3']);
  });

  it('shows everyone when nothing is typed', () => {
    expect(guestsToShow(everyone, '  ')).toHaveLength(3);
  });
});

describe('planNewGuest', () => {
  it('takes a name', () => {
    const plan = planNewGuest({ firstName: ' Jack ', surname: ' Kelly ', createdBy: 'r1' });

    expect(plan).toEqual({
      insert: { first_name: 'Jack', surname: 'Kelly', created_by: 'r1' },
    });
  });

  it('asks for both halves of a name', () => {
    expect(planNewGuest({ firstName: 'Jack', surname: '', createdBy: 'r1' })).toEqual({
      problem: 'A guest needs a first name and a surname.',
    });
    expect(planNewGuest({ firstName: '', surname: 'Kelly', createdBy: 'r1' })).toEqual({
      problem: 'A guest needs a first name and a surname.',
    });
  });

  it('does not refuse a name already on file — two Jack Kellys are allowed', () => {
    const plan = planNewGuest({ firstName: 'Jack', surname: 'Kelly', createdBy: 'r1' });

    expect('insert' in plan).toBe(true);
  });
});

describe('likelyAlready', () => {
  it('offers the guest already on file before one is added again', () => {
    expect(likelyAlready([kelly, burns], 'Jack', 'Kelly').map((g) => g.id)).toEqual(['g1']);
  });

  it('offers both when two people really do share a name', () => {
    expect(likelyAlready([kelly, otherKelly], 'Jack', 'Kelly').map((g) => g.id)).toEqual([
      'g1',
      'g4',
    ]);
  });

  it('matches on a surname typed on its own, before the first name is in', () => {
    expect(likelyAlready([kelly, burns], '', 'Kelly').map((g) => g.id)).toEqual(['g1']);
  });

  it('forgives the spelling that made one person into three', () => {
    expect(likelyAlready([okane], 'Orla', 'OKane').map((g) => g.id)).toEqual(['g2']);
  });

  it('offers nothing before anything is typed', () => {
    expect(likelyAlready([kelly], '', '')).toEqual([]);
  });

  it('offers nobody when the name is genuinely new', () => {
    expect(likelyAlready([kelly, burns], 'Mary', 'Devlin')).toEqual([]);
  });
});
