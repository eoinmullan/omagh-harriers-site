import { describe, expect, it } from 'vitest';
import { describeShown, isShown } from './list-filter';

const ainePrice = { search: 'aine price aine@example.com', tags: ['overdrawn', 'role:registrar'] };

describe('isShown', () => {
  it('shows every row when nothing is typed and no filter is on', () => {
    expect(isShown(ainePrice, { term: '', tags: [] })).toBe(true);
  });

  it('matches a search on any part of the row, ignoring case', () => {
    expect(isShown(ainePrice, { term: 'EXAMPLE', tags: [] })).toBe(true);
  });

  it('matches the words of a search in either order', () => {
    expect(isShown(ainePrice, { term: 'price aine', tags: [] })).toBe(true);
  });

  it('hides a row the search does not match', () => {
    expect(isShown(ainePrice, { term: 'conway', tags: [] })).toBe(false);
  });

  it('hides a row without the filter that is on', () => {
    expect(isShown(ainePrice, { term: '', tags: ['in-credit'] })).toBe(false);
  });

  it('needs every filter that is on, and the search too', () => {
    expect(isShown(ainePrice, { term: 'aine', tags: ['overdrawn', 'role:registrar'] })).toBe(true);
    expect(isShown(ainePrice, { term: 'conway', tags: ['overdrawn'] })).toBe(false);
  });
});

describe('describeShown', () => {
  it('says nothing when the whole list is showing', () => {
    expect(describeShown(12, 12)).toBe('');
  });

  it('says how much of the list is showing when it is narrowed', () => {
    expect(describeShown(3, 12)).toBe('3 of 12 shown');
  });
});
