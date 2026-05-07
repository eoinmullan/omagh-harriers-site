/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  readonly SUPABASE_SECRET_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    supabase: import('./lib/supabase/server').SupabaseServerClient;
  }
}
