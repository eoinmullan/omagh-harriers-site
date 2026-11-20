import { describe, expect, it } from 'vitest';
import { newFormId, submittedFormId } from './form-id';

describe('form ids', () => {
  it('mints a fresh id for every render', () => {
    const first = newFormId();
    const second = newFormId();

    expect(first).not.toBe(second);
    expect(submittedFormId(first)).toBe(first);
  });

  it('ignores anything that is not an id, so a stale or crafted form still saves once', () => {
    expect(submittedFormId('not-an-id')).toBeUndefined();
    expect(submittedFormId('')).toBeUndefined();
    expect(submittedFormId(null)).toBeUndefined();
  });
});
