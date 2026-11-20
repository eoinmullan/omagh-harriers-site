import { BigButton, Note, Screen } from './ui';

// Shown when the signed-in token carries no club role at all, which means the
// access-token hook isn't running, not that this person is only a member.
//
// The hook is registered by hand in the Supabase dashboard and in no
// migration, so it can go missing. Without it, RLS refuses every registrar's
// writes, and the old screen told every registrar they were "a club member
// rather than a registrar". The admin they were sent to would find the role
// already set, and nobody at the gate would know the real cause. This says
// it's not their account, what to do tonight, and exactly what to fix.
export function RolesNotArriving() {
  return (
    <Screen title="Club roles aren't reaching this app">
      <p className="text-lg text-neutral-300">
        This isn't a problem with your account. The club's sign-in service isn't telling this
        app who is a registrar, so nobody can take sign-ins here until it's fixed.
      </p>
      <Note>
        Take tonight's sign-ins on paper. For whoever looks after the club's Supabase: the
        access-token hook (Authentication → Hooks) isn't attaching roles to logins.
      </Note>
      <BigButton href="/members">Back to the members' area</BigButton>
    </Screen>
  );
}
