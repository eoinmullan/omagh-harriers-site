import type { APIRoute } from 'astro';
import { sendSignInEmail } from '../../lib/auth/sign-in-email';
import { signInEmailSteps } from '../../lib/auth/sign-in-email-steps';

// The registrar app's way to send the sign-in email without leaving the app.
// The same checks as `/signin`: Turnstile, then the member list.
export const POST: APIRoute = async (context) => {
  const body = (await context.request.json().catch(() => ({}))) as { email?: unknown; captchaToken?: unknown };
  const email = typeof body.email === 'string' ? body.email : '';
  const captchaToken = typeof body.captchaToken === 'string' ? body.captchaToken : '';

  const outcome = await sendSignInEmail(signInEmailSteps(context), email, captchaToken);

  return Response.json(outcome, { headers: { 'Cache-Control': 'no-store' } });
};
