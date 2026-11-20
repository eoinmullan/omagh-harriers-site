import { describe, expect, it } from 'vitest';
import { whoIsSignedIn } from './signed-in';

const user = { id: 'auth-id', email: 'mary@example.com' };
const principal = { id: 'principal-id', display_name: 'Mary Kelly', role: 'admin' as const };

describe('whoIsSignedIn', () => {
  it('hands a page the user and principal the middleware already looked up', () => {
    const who = whoIsSignedIn({ user, principal });

    expect(who).toEqual({ user, principal });
  });

  it('fails loudly on a page the middleware does not gate, instead of rendering as nobody', () => {
    expect(() => whoIsSignedIn({})).toThrow('whoIsSignedIn() was used on a page the middleware does not gate');
  });
});
