/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  readonly SUPABASE_SECRET_KEY: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY: string | undefined;
  readonly TURNSTILE_SECRET_KEY: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    supabase: import('./lib/supabase/server').SupabaseServerClient;
    runtime?: {
      env?: {
        SUPABASE_SECRET_KEY?: string;
        TURNSTILE_SECRET_KEY?: string;
        [key: string]: string | undefined;
      };
    };
  }
}
