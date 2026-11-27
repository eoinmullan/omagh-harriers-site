// The code in the sign-in email, typed wherever the person is signing in.
// Supabase issues one token per email and the link and the code are two ways
// of presenting it, so whichever is used first spends it.

// Must match Authentication → Sign In / Providers → Email → Email OTP Length.
// Six digits is a million codes, so the code's lifetime and Supabase's rate
// limit on verifying are what keep guessing one out of reach (OPERATIONS.md).
export const SIGN_IN_CODE_LENGTH = 6;

export const ENTER_THE_CODE = `Type the ${SIGN_IN_CODE_LENGTH}-digit code from the email here.`;

interface AuthFailure {
  status?: number;
  code?: string;
}

export const NO_SIGNAL = "Couldn't reach the club's site. Check you have signal, then try again.";

export type CodeCheck = { code: string } | { problem: string };

// Phones paste "123 456" or "123-456" as readily as "123456", and a space
// typed by hand is not a mistake worth refusing.
export function checkSignInCode(typed: string): CodeCheck {
  const code = typed.replace(/[\s-]/g, '');
  if (code === '') return { problem: ENTER_THE_CODE };
  if (!/^\d+$/.test(code)) return { problem: 'The code is numbers only. Check it against the email.' };
  if (code.length !== SIGN_IN_CODE_LENGTH) {
    return { problem: `The code is ${SIGN_IN_CODE_LENGTH} digits. Check you typed all of it.` };
  }
  return { code };
}

// Supabase answers a wrong code, an expired one and one the link has already
// spent with the same error, so one sentence has to cover all three.
export function codeRefusedSentence(failure: AuthFailure): string {
  // supabase-js reports a request that never reached Supabase as status 0.
  if (failure.status === 0) return NO_SIGNAL;
  if (failure.status === 429 || failure.code === 'over_request_rate_limit') {
    return 'Too many tries. Wait a few minutes, then send a new code.';
  }
  if (failure.code === 'otp_expired' || failure.status === 403) {
    return "That code didn't work, please check it again. If you tapped the link in the email, that invalidates the code, so press Send another below to send another.";
  }
  if (failure.code === 'user_banned') {
    return 'Your membership is no longer active — please contact the committee.';
  }
  return 'Something went wrong checking the code. Please try again.';
}

export function sendRefusedSentence(failure: AuthFailure): string {
  if (failure.code === 'over_email_send_rate_limit') {
    return 'A code was sent less than a minute ago. Wait a minute, then send another.';
  }
  if (failure.status === 429 || failure.code === 'over_request_rate_limit') {
    return 'Too many sign-in attempts — please wait a few minutes and try again.';
  }
  return 'Something went wrong sending the email. Please try again.';
}
