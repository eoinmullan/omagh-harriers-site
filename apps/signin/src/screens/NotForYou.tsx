import { BigButton } from '../components/BigButton';
import { Screen } from '../components/Screen';
import { supabase } from '../supabase';

// A member who installs the app and signs in has done nothing wrong, and gets
// told where their own account lives rather than an error. The real gate is
// RLS; this is just the screen being honest about it.
export function NotForYou({ email }: { email: string | null }) {
  return (
    <Screen title="Signed in, but not set up to sign runners in">
      <p className="text-lg text-slate-300">
        {email ? <strong className="text-slate-100">{email}</strong> : 'This account'} is a club
        member rather than a registrar. If you've been asked to take sign-ins, a club admin can
        add that to your account.
      </p>
      <p className="text-lg text-slate-300">
        Your own credit and training are on the website, under Members' area.
      </p>
      <BigButton tone="quiet" onClick={() => void supabase.auth.signOut()}>
        Sign out
      </BigButton>
    </Screen>
  );
}
