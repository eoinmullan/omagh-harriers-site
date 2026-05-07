import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export type SupabaseBrowserClient = SupabaseClient<Database>;

export function createSupabaseBrowserClient(): SupabaseBrowserClient {
  return createBrowserClient<Database>(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
