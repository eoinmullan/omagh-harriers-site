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

  it('does not match across the gap between the two names', () => {
    expect(matchesName({ firstName: 'John', surname: 'Okane' }, 'nokane')).toBe(false);
  });
});
