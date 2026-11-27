import { useState, type FormEvent } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase/browser';
import {
  checkSignInCode,
  codeRefusedSentence,
  ENTER_THE_CODE,
  NO_SIGNAL,
  SIGN_IN_CODE_LENGTH,
} from '../../lib/auth/sign-in-code';
import type { SignInEmailOutcome } from '../../lib/auth/sign-in-email';
import { BigButton, Note, Problem, Screen } from './ui';
import { Turnstile, TURNSTILE_SITE_KEY } from './Turnstile';

// The signed-out screen signs the app in where it stands.
//
// On an iPhone a home screen app has its own cookies, and the link in the
// sign-in email opens Safari rather than this window. So the app sends the
// email itself and asks for the code from it, and the session lands in this
// app's cookies. Tapping the link instead signs Safari in and spends the code,
// which is why a refused code says so and Send another sits beside it.

const field =
  'min-h-14 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 text-lg text-white placeholder:text-neutral-400';

type Stage = { step: 'email' } | { step: 'code'; email: string };

async function askForEmail(email: string, captchaToken: string): Promise<SignInEmailOutcome> {
  try {
    const response = await fetch('/signin/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, captchaToken }),
    });
    if (!response.ok) return { sent: false, problem: 'Something went wrong sending the email. Please try again.' };
    return (await response.json()) as SignInEmailOutcome;
  } catch {
    return { sent: false, problem: NO_SIGNAL };
  }
}

export function SignedOut() {
  const [stage, setStage] = useState<Stage>({ step: 'email' });
  const [typedEmail, setTypedEmail] = useState('');
  const [typedCode, setTypedCode] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaRound, setCaptchaRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const captchaReady = !TURNSTILE_SITE_KEY || captchaToken !== '';

  async function send(email: string) {
    setBusy(true);
    setProblem(undefined);
    setNotice(undefined);
    const outcome = await askForEmail(email, captchaToken);
    setCaptchaToken('');
    setCaptchaRound((round) => round + 1);
    setBusy(false);

    if (!outcome.sent) {
      setProblem(outcome.problem);
      return;
    }
    if (stage.step === 'code') setNotice('A new email is on its way. Use the code from that one.');
    setTypedCode('');
    setStage({ step: 'code', email: outcome.email });
  }

  async function verify(email: string) {
    const check = checkSignInCode(typedCode);
    if ('problem' in check) {
      setProblem(check.problem);
      return;
    }

    setBusy(true);
    setProblem(undefined);
    setNotice(undefined);
    const { error } = await createSupabaseBrowserClient().auth.verifyOtp({ email, token: check.code, type: 'email' });
    if (!error) return; // RegistrarApp hears SIGNED_IN and moves on.

    setBusy(false);
    setProblem(codeRefusedSentence({ status: error.status, code: error.code }));
  }

  function submit(event: FormEvent, action: () => Promise<void>) {
    event.preventDefault();
    void action();
  }

  const captcha = TURNSTILE_SITE_KEY && (
    <Turnstile key={captchaRound} siteKey={TURNSTILE_SITE_KEY} onToken={setCaptchaToken} />
  );

  if (stage.step === 'email') {
    return (
      <Screen title="Sign in">
        <p className="text-lg text-neutral-300">
          Use the email address on your Omagh Harriers membership. We'll email you a code to type in here.
        </p>
        <form className="flex flex-col gap-4" onSubmit={(event) => submit(event, () => send(typedEmail))}>
          <input
            type="email"
            required
            autoComplete="email"
            aria-label="Membership email address"
            placeholder="you@example.com"
            value={typedEmail}
            onChange={(event) => setTypedEmail(event.target.value)}
            className={field}
          />
          {captcha}
          {problem && <Problem>{problem}</Problem>}
          <BigButton submit disabled={busy || !captchaReady || typedEmail.trim() === ''}>
            {busy ? 'Sending…' : 'Email me a code'}
          </BigButton>
        </form>
      </Screen>
    );
  }

  return (
    <Screen title="Check your email">
      <p className="text-lg text-neutral-300">{`Type the ${SIGN_IN_CODE_LENGTH}-digit code from the email here.`}</p>
      <form className="flex flex-col gap-4" onSubmit={(event) => submit(event, () => verify(stage.email))}>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label={ENTER_THE_CODE}
          maxLength={SIGN_IN_CODE_LENGTH + 3}
          autoFocus
          value={typedCode}
          onChange={(event) => setTypedCode(event.target.value)}
          className={`${field} text-center font-mono text-3xl tracking-[0.3em]`}
        />
        {problem && <Problem>{problem}</Problem>}
        {notice && <Note>{notice}</Note>}
        <BigButton submit disabled={busy}>
          {busy ? 'Checking…' : 'Sign in'}
        </BigButton>
      </form>

      <form className="flex flex-col gap-3" onSubmit={(event) => submit(event, () => send(stage.email))}>
        {captcha}
        <BigButton submit tone="quiet" disabled={busy || !captchaReady}>
          Send another
        </BigButton>
      </form>

      <p className="break-words text-base text-neutral-400">
        Sent to {stage.email}.{' '}
        <button
          type="button"
          className="min-h-11 text-neutral-200 underline"
          onClick={() => {
            setProblem(undefined);
            setNotice(undefined);
            setStage({ step: 'email' });
          }}
        >
          Use a different email
        </button>
      </p>
    </Screen>
  );
}
