import { describe, expect, it } from 'vitest';
import { loginFor, type LoginDirectory } from './logins';

describe('loginFor', () => {
  function directory(options: {
    existing?: { id: string; email: string }[];
    createFails?: { message: string; code?: string };
    perPage?: number;
  } = {}): LoginDirectory & { created: string[] } {
    const users = [...(options.existing ?? [])];
    const created: string[] = [];
    return {
      created,
      async createUser({ email }) {
        if (options.createFails) return { data: { user: null }, error: options.createFails };
        if (users.some((user) => user.email === email)) {
          return { data: { user: null }, error: { message: 'already registered', code: 'email_exists' } };
        }
        const user = { id: `new-${email}`, email };
        users.push(user);
        created.push(email);
        return { data: { user }, error: null };
      },
      async listUsers({ page, perPage }) {
        const size = Math.min(perPage, options.perPage ?? perPage);
        return { data: { users: users.slice((page - 1) * size, page * size) }, error: null };
      },
    };
  }

  it('creates a login for an address that has none', async () => {
    const logins = directory();

    const login = await loginFor(logins, 'new@example.com');

    expect(login).toEqual({ id: 'new-new@example.com', created: true });
    expect(logins.created).toEqual(['new@example.com']);
  });

  it('reuses the login an earlier, interrupted run left behind', async () => {
    const logins = directory({ existing: [{ id: 'orphan-id', email: 'stranded@example.com' }] });

    const login = await loginFor(logins, 'stranded@example.com');

    expect(login).toEqual({ id: 'orphan-id', created: false });
    expect(logins.created).toEqual([]);
  });

  it('finds that login however many pages of users come before it', async () => {
    const others = Array.from({ length: 7 }, (_, i) => ({ id: `u${i}`, email: `u${i}@example.com` }));
    const logins = directory({
      existing: [...others, { id: 'orphan-id', email: 'stranded@example.com' }],
      perPage: 3,
    });

    const login = await loginFor(logins, 'stranded@example.com');

    expect(login.id).toBe('orphan-id');
  });

  it('recognises the older "user already exists" code too', async () => {
    const logins = directory({
      existing: [{ id: 'orphan-id', email: 'stranded@example.com' }],
      createFails: { message: 'User already registered', code: 'user_already_exists' },
    });

    const login = await loginFor(logins, 'stranded@example.com');

    expect(login.id).toBe('orphan-id');
  });

  it('passes any other refusal straight through', async () => {
    const logins = directory({ createFails: { message: 'rate limit exceeded', code: 'over_request_rate_limit' } });

    await expect(loginFor(logins, 'new@example.com')).rejects.toThrow('rate limit exceeded');
  });
});
