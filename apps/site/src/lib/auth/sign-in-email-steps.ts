import type { SignInEmailSteps } from './sign-in-email';
import { createSupabaseAdminClientFromLocals } from '../supabase/admin';

// The calls behind `sendSignInEmail`, for a page or an endpoint. Every rule
// is in `sign-in-email.ts`; this only reaches Turnstile and Supabase.

interface RequestContext {
  locals: App.Locals;
  url: URL;
}

export function signInEmailSteps({ locals, url }: RequestContext): SignInEmailSteps {
  return {
    captchaPasses: turnstileAccepts,

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

async function turnstileAccepts(token: string): Promise<boolean> {
  if (import.meta.env.DEV) return true;
  if (!import.meta.env.TURNSTILE_SECRET_KEY) return true;

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: import.meta.env.TURNSTILE_SECRET_KEY, response: token }),
  });
  const { success } = (await response.json()) as { success: boolean };
  return success;
}
