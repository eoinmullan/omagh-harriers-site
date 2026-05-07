import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import type { Database } from './types';

export type SupabaseServerClient = SupabaseClient<Database>;

interface SupabaseServerContext {
  request: Request;
  cookies: AstroCookies;
}

export function createSupabaseServerClient(
  context: SupabaseServerContext,
): SupabaseServerClient {
  return createServerClient<Database>(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(
            context.request.headers.get('Cookie') ?? '',
          ).map(({ name, value }) => ({ name, value: value ?? '' }));
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            context.cookies.set(name, value, options);
          }
        },
      },
    },
  );
}
