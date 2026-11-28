import type { User } from '@supabase/supabase-js';
import type { PrincipalRole } from '../supabase/types';

// Who is signed in, as the middleware already established it.
//
// Every page under /members and /admin used to ask Supabase Auth who the
// user was, then read their principal, straight after the middleware had
// done both for the same request: four round trips, one after another,
// before the page fetched anything of its own. The middleware now puts what it
// found on `Astro.locals`, and pages read it from there.
//
// It throws rather than returning nothing, because the only way to get here
// without a user is a page outside the gated paths, and that's a bug to see,
// not a page to render for nobody.

export interface SignedInPrincipal {
  id: string;
  display_name: string;
  role: PrincipalRole;
  opensEmergencyContacts: boolean;
}

export interface SignedIn<U = User> {
  user: U;
  principal: SignedInPrincipal;
}

export function whoIsSignedIn<U>(locals: { user?: U; principal?: SignedInPrincipal }): SignedIn<U> {
  if (!locals.user || !locals.principal) {
    throw new Error(
      'whoIsSignedIn() was used on a page the middleware does not gate. Only /members and /admin are.',
    );
  }
  return { user: locals.user, principal: locals.principal };
}
