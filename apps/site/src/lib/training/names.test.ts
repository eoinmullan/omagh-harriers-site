import { describe, expect, it } from 'vitest';
import { matchesName, normaliseForSearch } from './names';

const runner = { firstName: "Siobhán", surname: "O'Kane" };

describe('normaliseForSearch', () => {
  it('folds case, whitespace, apostrophes and hyphens away', () => {
    expect(normaliseForSearch("O'Kane")).toBe('okane');
    expect(normaliseForSearch('O Kane')).toBe('okane');
    expect(normaliseForSearch('o-kane')).toBe('okane');
    expect(normaliseForSearch('O’Kane')).toBe('okane');
  });

  it('leaves the rest of the name alone', () => {
    expect(normaliseForSearch('Mac Gabhann')).toBe('macgabhann');
  });

  it('folds the accents an Irish name arrives with', () => {
    expect(normaliseForSearch('Siobhán')).toBe('siobhan');
    expect(normaliseForSearch('Seán Ó Dónaill')).toBe('seanodonaill');
  });
});

describe('matchesName', () => {
  it('matches a surname however either side spelled it', () => {
    expect(matchesName(runner, 'okane')).toBe(true);
    expect(matchesName(runner, "O'Kane")).toBe(true);
    expect(matchesName(runner, 'O KANE')).toBe(true);
  });

  it('matches part way into a name, not only the start', () => {
    expect(matchesName(runner, 'kane')).toBe(true);
    expect(matchesName(runner, 'bhan')).toBe(true);
  });

  it('matches on either name', () => {
    expect(matchesName(runner, 'siobhan')).toBe(true);
  });

  it('refuses a term that is in neither name', () => {
    expect(matchesName(runner, 'kelly')).toBe(false);
  });

  it('matches everyone when nothing has been typed', () => {
    expect(matchesName(runner, '')).toBe(true);
    expect(matchesName(runner, '   ')).toBe(true);
  });

  it('matches the full name in either order', () => {
    expect(matchesName(runner, 'Siobhán O\'Kane')).toBe(true);
    expect(matchesName(runner, "o'kane siobhan")).toBe(true);
    expect(matchesName(runner, 'siobhan okane')).toBe(true);
  });

  it('matches part of each name, in either order', () => {
    expect(matchesName(runner, 'sio kan')).toBe(true);
    expect(matchesName(runner, 'kan sio')).toBe(true);
  });

  it('matches across the gap between the two names', () => {
    expect(matchesName({ firstName: 'John', surname: 'Okane' }, 'nokane')).toBe(true);
  });

  it('refuses a name when only some of its words are found', () => {
    expect(matchesName(runner, 'siobhan kelly')).toBe(false);
    expect(matchesName(runner, 'kelly okane')).toBe(false);
  });
});
