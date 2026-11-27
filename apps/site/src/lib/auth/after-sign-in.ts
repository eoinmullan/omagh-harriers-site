import type { SupabaseServerClient } from '../supabase/server';
import { orThrow } from '../supabase/or-throw';

// Where a sign-in lands, however it was made: by link, by code or by provider.

export function destinationAfterSignIn(principal: { terms_accepted_at: string | null } | null): string {
  return principal?.terms_accepted_at ? '/members' : '/signin/terms';
}

export async function whereToAfterSignIn(supabase: SupabaseServerClient, authUserId: string): Promise<string> {
  const principal = orThrow(
    await supabase.from('principals').select('terms_accepted_at').eq('auth_user_id', authUserId).maybeSingle(),
  );
  return destinationAfterSignIn(principal);
}
