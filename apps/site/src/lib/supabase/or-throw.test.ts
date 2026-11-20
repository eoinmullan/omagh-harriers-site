import { describe, expect, it } from 'vitest';
import { orThrow } from './or-throw';

describe('orThrow', () => {
  it('hands back the rows of a read that worked', () => {
    const rows = orThrow({ data: [{ id: 'a' }], error: null });

    expect(rows).toEqual([{ id: 'a' }]);
  });

  it('hands back an empty answer as empty, because nothing found is not a failure', () => {
    const row = orThrow({ data: null, error: null });

    expect(row).toBeNull();
  });

  it('fails the page when the read failed, rather than letting it look empty', () => {
    expect(() => orThrow({ data: null, error: { message: 'connection refused' } })).toThrow(
      'connection refused',
    );
  });
});
