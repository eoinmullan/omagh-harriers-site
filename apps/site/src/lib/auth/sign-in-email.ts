import { sendRefusedSentence } from './sign-in-code';

// Sending the sign-in email, for `/signin` and for the registrar app alike.
// One email carries both the link and the code.

export interface MembershipLookup {
  isActive: boolean;
}

export interface SignInEmailSteps {
  captchaPasses(token: string): Promise<boolean>;
  findMembership(email: string): Promise<MembershipLookup | undefined>;
  sendEmail(email: string): Promise<{ status?: number; code?: string } | undefined>;
  pause(milliseconds: number): Promise<void>;
}

export type SignInEmailOutcome = { sent: true; email: string } | { sent: false; problem: string };

export const NOT_ON_THE_MEMBER_LIST =
  "We couldn't find that email on our member list. Check it for typos, and check that it's the address you gave when you registered with the club on Klubfunder. If it still doesn't work, contact the committee.";

export const MEMBERSHIP_LAPSED = 'Your membership is no longer active — please contact the committee.';

export const CAPTCHA_FAILED = 'Please complete the security check and try again.';

// So the time taken doesn't reveal whether the email exists.
export const REFUSAL_DELAY_MS = 2000;

export function tidyEmail(typed: string): string {
  return typed.trim().toLowerCase();
}

// A Turnstile token can be checked once, so this is the only place that
// checks it, and `/signin` calls it before choosing between a provider and
// the email.
export async function whyNotThisMember(
  steps: Pick<SignInEmailSteps, 'captchaPasses' | 'findMembership' | 'pause'>,
  email: string,
  captchaToken: string,
): Promise<string | undefined> {
  if (!(await steps.captchaPasses(captchaToken))) return CAPTCHA_FAILED;

  const membership = await steps.findMembership(email);
  if (membership?.isActive) return undefined;

  await steps.pause(REFUSAL_DELAY_MS);
  return membership ? MEMBERSHIP_LAPSED : NOT_ON_THE_MEMBER_LIST;
}

export async function emailTheMember(
  steps: Pick<SignInEmailSteps, 'sendEmail'>,
  email: string,
): Promise<SignInEmailOutcome> {
  const failure = await steps.sendEmail(email);
  return failure ? { sent: false, problem: sendRefusedSentence(failure) } : { sent: true, email };
}

export async function sendSignInEmail(
  steps: SignInEmailSteps,
  typedEmail: string,
  captchaToken: string,
): Promise<SignInEmailOutcome> {
  const email = tidyEmail(typedEmail);
  const problem = await whyNotThisMember(steps, email, captchaToken);
  return problem ? { sent: false, problem } : emailTheMember(steps, email);
}
