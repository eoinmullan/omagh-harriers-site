import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { mayRunASession, roleFromAccessToken } from './lib/registrar';
import { SessionPicker } from './screens/SessionPicker';
import { SignIn } from './screens/SignIn';
import { Waiting } from './screens/Waiting';
import { NotForYou } from './screens/NotForYou';
import { supabase } from './supabase';

// `undefined` is "we have not looked yet", which is a different screen from
// `null`, "nobody is signed in". Collapsing the two flashes the sign-in form at
// a registrar who is already signed in, every time the app opens.
type AuthState = Session | null | undefined;

export function App() {
  const [session, setSession] = useState<AuthState>(undefined);

  useEffect(() => {
    // supabase-js emits INITIAL_SESSION as soon as it has read local storage,
    // so this one subscription covers both the stored session and every change
    // after it. Calling getSession() as well would race it for no gain.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));

    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) return <Waiting />;
  if (session === null) return <SignIn />;

  const role = roleFromAccessToken(session.access_token);
  if (!mayRunASession(role)) {
    return <NotForYou email={session.user.email ?? null} />;
  }

  return <SessionPicker />;
}
