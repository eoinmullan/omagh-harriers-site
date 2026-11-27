import { describe, expect, it } from 'vitest';
import { destinationAfterSignIn } from './after-sign-in';

describe('destinationAfterSignIn', () => {
  it('opens the members area once the terms are accepted', () => {
    const destination = destinationAfterSignIn({ terms_accepted_at: '2026-11-01T10:00:00Z' });

    expect(destination).toBe('/members');
  });

  it('asks for the terms first when they have not been accepted', () => {
    const destination = destinationAfterSignIn({ terms_accepted_at: null });

    expect(destination).toBe('/signin/terms');
  });

  it('asks for the terms when no household was found', () => {
    const destination = destinationAfterSignIn(null);

    expect(destination).toBe('/signin/terms');
  });
});
