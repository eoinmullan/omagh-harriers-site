import type { PrincipalRole } from '@omagh/supabase';

// Who the app will show a session to, and why the claim is read rather than
// the `principals` table.
//
// The authoritative gate is RLS, server side: a member who got this far could
// not write an attendance row if they tried. What is decided here is only what
// the app puts on screen — and it has to be decidable with no connection at
// all, because a registrar opening the app at a track with no signal still
// needs to see their session list. The role travels in the access token, which
// is in local storage, so the answer is already on the phone.
//
// The cost of that is staleness: a role taken away is still in the token until
// it next refreshes. That is the right trade for a screen, and the wrong one
// for a write, which is why the write is RLS's business and not this
// function's.

const REGISTRAR_ROLES: readonly PrincipalRole[] = ['registrar', 'admin', 'superuser'];

const KNOWN_ROLES: readonly PrincipalRole[] = ['member', ...REGISTRAR_ROLES];

export function mayRunASession(role: PrincipalRole | undefined): boolean {
  return role !== undefined && REGISTRAR_ROLES.includes(role);
}

/**
 * The role in a Supabase access token.
 *
 * The claim is **`app_role`**, never `role` — PostgREST reserves `role` for the
 * PostgreSQL session role, which is why migration `0004` moved it. Reading the
 * wrong one gets `authenticated` back, which is not a club role and would fail
 * `mayRunASession` for everybody.
 *
 * Anything unreadable, unsigned-looking or carrying a role we don't know about
 * comes back undefined. A token is not trusted here for authority — it is read
 * for a hint about what to draw — so the only sane response to a surprise is to
 * draw nothing.
 */
export function roleFromAccessToken(token: string | null | undefined): PrincipalRole | undefined {
  const claims = claimsFromAccessToken(token);
  if (!claims) return undefined;

  const claimed = (claims as Record<string, unknown>)['app_role'];
  return KNOWN_ROLES.find((role) => role === claimed);
}

function claimsFromAccessToken(token: string | null | undefined): unknown {
  const payload = token?.split('.')[1];
  if (!payload) return undefined;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
}
