import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export type SupabaseAdminClient = SupabaseClient<Database>;

// Service-role client. Bypasses RLS. Used by the Klubfunder sync CLI and (in
// later phases) by server-side admin endpoints. Never instantiate this from
// client-side code — the secret key must stay on the server.
export function createSupabaseAdminClient(
  url: string,
  secretKey: string,
): SupabaseAdminClient {
  return createClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Astro page variant: reads the secret key from the CF Pages runtime env
// (Astro.locals.runtime.env) with a fallback to import.meta.env for local dev.
export function createSupabaseAdminClientFromLocals(
  locals: App.Locals,
): SupabaseAdminClient {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const secretKey = locals.runtime?.env?.SUPABASE_SECRET_KEY ?? import.meta.env.SUPABASE_SECRET_KEY;
  return createSupabaseAdminClient(url, secretKey);
}
