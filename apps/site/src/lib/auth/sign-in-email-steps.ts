import { judgeCaptcha, type SignInEmailSteps } from './sign-in-email';
import { createSupabaseAdminClientFromLocals } from '../supabase/admin';

// The calls behind `sendSignInEmail`, for a page or an endpoint. Every rule
// is in `sign-in-email.ts`; this only reaches Turnstile and Supabase.

interface RequestContext {
  locals: App.Locals;
  url: URL;
}

export function signInEmailSteps({ locals, url }: RequestContext): SignInEmailSteps {
  return {
    async checkCaptcha(token) {
      // A secret arrives on the Cloudflare runtime, not in import.meta.env,
      // which is why the service-role key is read the same way.
      const secret = locals.runtime?.env?.TURNSTILE_SECRET_KEY ?? import.meta.env.TURNSTILE_SECRET_KEY;
      const verdict = await judgeCaptcha({ inDevelopment: import.meta.env.DEV, secret, token, askCloudflare });
      if (verdict === 'unavailable') {
        console.error(secret ? '[signin] Turnstile siteverify unreachable' : '[signin] TURNSTILE_SECRET_KEY is not set');
      }
      return verdict;
    },

    async findMembership(email) {
      const { data, error } = await createSupabaseAdminClientFromLocals(locals)
        .from('principals')
        .select('is_active')
        .eq('email', email)
        .maybeSingle();
      if (error) console.error('[signin] principals lookup failed:', error);
      return data ? { isActive: data.is_active } : undefined;
    },

    async sendEmail(email) {
      const { error } = await locals.supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: new URL('/signin/callback', url).href,
        },
      });
      if (!error) return undefined;
      console.error('[signin] signInWithOtp failed:', error);
      return { status: error.status, code: error.code };
    },

    pause: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  };
}

async function askCloudflare(secret: string, token: string): Promise<boolean> {
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token }),
  });
  if (!response.ok) throw new Error(`siteverify answered ${response.status}`);
  const { success } = (await response.json()) as { success: boolean };
  return success === true;
}
