import { useState } from 'react';
import { BigButton } from '../components/BigButton';
import { Screen } from '../components/Screen';
import { supabase } from '../supabase';

// A link to the registrar's email, and nothing else to choose from.
//
// The website offers Google and Microsoft alongside the link, because it knows
// which provider a membership address belongs to. Here that would be two more
// redirect URLs to register against a second domain, for a sign-in that happens
// once per phone. The link works for every address the club holds.

type State = 'asking' | 'sending' | 'sent' | { problem: string };

export function SignIn() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('asking');

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;

    setState('sending');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });

    setState(error ? { problem: error.message } : 'sent');
  }

  if (state === 'sent') {
    return (
      <Screen title="Check your email">
        <p className="text-lg text-slate-300">
          A sign-in link is on its way to <strong className="text-slate-100">{email}</strong>.
          Open it on this phone and the app will stay signed in.
        </p>
        <BigButton tone="quiet" onClick={() => setState('asking')}>
          Use a different address
        </BigButton>
      </Screen>
    );
  }

  return (
    <Screen title="Sign in">
      <p className="text-lg text-slate-300">
        Your club membership email. We'll send a link rather than ask for a password.
      </p>

      <form onSubmit={send} className="flex flex-col gap-4">
        <input
          type="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-label="Club membership email"
          className="min-h-14 w-full rounded-xl border border-edge bg-raised px-4 text-lg text-slate-50 placeholder:text-slate-500"
        />

        <BigButton type="submit" disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : 'Send me a link'}
        </BigButton>
      </form>

      {typeof state === 'object' && (
        <p role="alert" className="rounded-xl bg-red-950 px-4 py-3 text-base text-red-200">
          {state.problem}
        </p>
      )}
    </Screen>
  );
}
