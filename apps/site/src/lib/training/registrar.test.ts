import { describe, expect, it } from 'vitest';
import { mayRunASession, roleFromAccessToken } from './registrar';

function tokenCarrying(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.signature`;
}

describe('mayRunASession', () => {
  it('lets a registrar in', () => {
    expect(mayRunASession('registrar')).toBe(true);
  });

  it('lets an admin and a superuser in, because they already could', () => {
    expect(mayRunASession('admin')).toBe(true);
    expect(mayRunASession('superuser')).toBe(true);
  });

  it('keeps an ordinary member out', () => {
    expect(mayRunASession('member')).toBe(false);
  });

  it('keeps out a role it could not read', () => {
    expect(mayRunASession(undefined)).toBe(false);
  });
});

describe('roleFromAccessToken', () => {
  it('reads the app_role claim', () => {
    expect(roleFromAccessToken(tokenCarrying({ app_role: 'registrar' }))).toBe('registrar');
  });

  it('ignores the reserved role claim, which is never a club role', () => {
    expect(roleFromAccessToken(tokenCarrying({ role: 'authenticated' }))).toBeUndefined();
  });

  it('prefers app_role when both are present', () => {
    expect(
      roleFromAccessToken(tokenCarrying({ role: 'authenticated', app_role: 'admin' })),
    ).toBe('admin');
  });

  it('reads a token whose payload needs base64url padding', () => {
    const token = tokenCarrying({ app_role: 'member', sub: 'a'.repeat(7) });
    expect(roleFromAccessToken(token)).toBe('member');
  });

  it('reads a claim set carrying a name with an accent in it', () => {
    const token = tokenCarrying({ app_role: 'registrar', name: 'Siobhán Ní Ghallchóir' });
    expect(roleFromAccessToken(token)).toBe('registrar');
  });

  it('gives up on a role it does not recognise rather than passing it on', () => {
    expect(roleFromAccessToken(tokenCarrying({ app_role: 'treasurer' }))).toBeUndefined();
  });

  it('gives up on a missing claim', () => {
    expect(roleFromAccessToken(tokenCarrying({ sub: 'abc' }))).toBeUndefined();
  });

  it('gives up on a token that is not a token', () => {
    expect(roleFromAccessToken('not-a-jwt')).toBeUndefined();
    expect(roleFromAccessToken('header..signature')).toBeUndefined();
    expect(roleFromAccessToken('header.{nonsense}.signature')).toBeUndefined();
  });

  it('gives up on nothing at all', () => {
    expect(roleFromAccessToken(null)).toBeUndefined();
    expect(roleFromAccessToken(undefined)).toBeUndefined();
    expect(roleFromAccessToken('')).toBeUndefined();
  });
});
