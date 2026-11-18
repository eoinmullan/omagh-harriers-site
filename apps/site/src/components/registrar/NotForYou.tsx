import { BigButton, Screen } from './ui';

// A member who finds this page has done nothing wrong and gets told where their
// own account lives, rather than an error. The real gate is RLS; this is the
// screen being honest about what it can see.
export function NotForYou({ email }: { email: string | null }) {
  return (
    <Screen title="Not set up to sign runners in">
      <p className="text-lg text-slate-300">
        {email ? <strong className="text-slate-100">{email}</strong> : 'This account'} is a club
        member rather than a registrar. If you've been asked to take sign-ins, a club admin can
        add that to your account.
      </p>
      <BigButton href="/members">Back to the members' area</BigButton>
    </Screen>
  );
}
