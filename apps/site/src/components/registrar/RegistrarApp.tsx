import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { mayRunASession, roleFromAccessToken } from '../../lib/training/registrar';
import { createSupabaseBrowserClient } from '../../lib/supabase/browser';
import { NotForYou } from './NotForYou';
import { SessionPicker } from './SessionPicker';
import { SignedOut } from './SignedOut';
import { Screen } from './ui';
import { useServiceWorker } from './useServiceWorker';

// The whole route, as one island.
//
// There is no sign-in form here. The session is the site's own, in the same
// cookies the members' area uses — which is the point of living on this origin
// rather than a second one, and the only kind of session iOS copies into a home
// screen app when it is added.
//
// `undefined` is "we have not looked yet", which is a different screen from
// `null`, "nobody is signed in". Collapsing the two flashes the signed-out
// screen at a registrar who is already signed in, every time they open the app.
type AuthState = Session | null | undefined;

export function RegistrarApp() {
  const [session, setSession] = useState<AuthState>(undefined);

  // Registered from here, not from the shared layout: every other page on this
  // origin is public, and a worker registered by one of those would be able to
  // answer for the marketing site.
  useServiceWorker();

  useEffect(() => {
    // supabase-js emits INITIAL_SESSION as soon as it has read the cookies, so
    // one subscription covers both the stored session and every change after
    // it. Calling getSession() as well would only race it.
    const {
      data: { subscription },
    } = createSupabaseBrowserClient().auth.onAuthStateChange((_event, next) => setSession(next));

    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <Screen>
        <p className="text-lg text-neutral-400">Opening…</p>
      </Screen>
    );
  }

  if (session === null) return <SignedOut />;

  if (!mayRunASession(roleFromAccessToken(session.access_token))) {
    return <NotForYou email={session.user.email ?? null} />;
  }

  // Passed down rather than re-fetched: any auth call inside the night's load
  // can hang on a token refresh when the network is dead, and take the whole
  // screen with it.
  return <SessionPicker authUserId={session.user.id} />;
}
