import type { Database } from '@omagh/supabase';
import { createClient } from '@supabase/supabase-js';

// The anon key and RLS, never a service-role key. This app runs on a
// volunteer's phone and anything it holds is readable by whoever holds the
// phone, so what a registrar may write is the database's decision and not this
// file's. RLS gates on the `app_role` claim.
//
// `persistSession` is the point of the whole thing: a registrar signs in once
// and the app is still signed in next Monday, on a cold night, possibly with no
// signal. That is why the website's cookie-backed client was left behind in
// `apps/site` rather than shared.

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. The site uses the PUBLIC_ prefix; Vite needs VITE_.',
  );
}

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
