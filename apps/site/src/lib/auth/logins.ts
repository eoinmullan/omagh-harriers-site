// Logins for households.
//
// Two places create a household, the Klubfunder sync and /admin/households,
// and both do it in two writes that nothing makes atomic: the login, then the
// `principals` row. If the second failed, the login survived with no
// household, and every later attempt was refused as already registered, so
// that household could never be added without somebody removing the login by
// hand in the dashboard. The sync was fixed first (Round 2 backend, B3); the
// admin page kept the bug until this moved here (code quality, Q3).
//
// So a refusal for an address that's already registered isn't treated as a
// failure. It's the trace of an earlier run that got halfway, and the login it
// left is the one this household should have. Any other refusal still fails
// the action.
//
// Narrow on purpose, so the test can fake it. Supabase's auth admin API
// satisfies it as it is.
export interface LoginDirectory {
  createUser(attributes: { email: string; email_confirm: boolean }): PromiseLike<{
    data: { user: { id: string } | null };
    error: { message: string; code?: string } | null;
  }>;
  listUsers(params: { page: number; perPage: number }): PromiseLike<{
    data: { users: { id: string; email?: string }[] };
    error: { message: string } | null;
  }>;
}

const ALREADY_REGISTERED = new Set(['email_exists', 'user_already_exists']);

/**
 * The login for `email`, and whether this call made it. A caller that undoes
 * its own work on failure must only delete a login it created: one that was
 * found belongs to an earlier attempt, or to somebody else.
 */
export async function loginFor(
  logins: LoginDirectory,
  email: string,
): Promise<{ id: string; created: boolean }> {
  const { data, error } = await logins.createUser({ email, email_confirm: true });
  if (data.user) return { id: data.user.id, created: true };

  if (!error || !ALREADY_REGISTERED.has(error.code ?? '')) {
    throw new Error(error?.message ?? 'auth.admin.createUser returned no user');
  }

  const existing = await findLogin(logins, email);
  if (!existing) throw new Error(`${email} is registered, but its login could not be found to link`);
  return { id: existing, created: false };
}

// Pages until an empty page, like `everyRow`, so a server page smaller than
// the one asked for still reaches every login.
async function findLogin(logins: LoginDirectory, email: string): Promise<string | undefined> {
  const wanted = email.toLowerCase();

  for (let page = 1; ; page++) {
    const { data, error } = await logins.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);

    const match = data.users.find((user) => user.email?.toLowerCase() === wanted);
    if (match) return match.id;
    if (data.users.length === 0) return undefined;
  }
}
