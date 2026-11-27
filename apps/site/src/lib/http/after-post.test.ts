import { describe, expect, it } from 'vitest';
import { redirectAfterPost, takeFlash, type FlashCookies } from './after-post';

function cookieJar(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const jar: FlashCookies & { values: Map<string, string> } = {
    values,
    get: (name) => (values.has(name) ? { value: values.get(name)! } : undefined),
    set: (name, value) => void values.set(name, value),
    delete: (name) => void values.delete(name),
  };
  return jar;
}

function page(path: string, search = '') {
  const cookies = cookieJar();
  const redirects: [string, number][] = [];
  return {
    cookies,
    redirects,
    astro: {
      cookies,
      url: new URL(`http://localhost${path}${search}`),
      redirect: (to: string, status: number) => {
        redirects.push([to, status]);
        return new Response(null, { status, headers: { Location: to } });
      },
    },
  };
}

describe('redirectAfterPost', () => {
  it('sends the browser back to the same page with a 303, so a reload is a GET', () => {
    const p = page('/admin/sessions');

    const response = redirectAfterPost(p.astro, 'Middle Distance created.');

    expect(response.status).toBe(303);
    expect(p.redirects).toEqual([['/admin/sessions', 303]]);
  });

  it('keeps the query string', () => {
    const p = page('/admin/households', '?sort=balance');

    redirectAfterPost(p.astro, 'Added.');

    expect(p.redirects[0][0]).toBe('/admin/households?sort=balance');
  });

  it('goes to the page of something the form made, when given one', () => {
    const p = page('/admin/squads');

    redirectAfterPost(p.astro, 'Sprints added.', '/admin/squads/new-squad-id');

    expect(p.redirects).toEqual([['/admin/squads/new-squad-id', 303]]);
  });

  it('carries the confirmation in a cookie rather than the URL', () => {
    const p = page('/admin/members');

    redirectAfterPost(p.astro, 'James Conway added.');

    expect(p.redirects[0][0]).not.toContain('Conway');
    expect([...p.cookies.values.values()]).toEqual(['James Conway added.']);
  });
});

describe('takeFlash', () => {
  it('reads the confirmation once and forgets it', () => {
    const p = page('/admin/members');
    redirectAfterPost(p.astro, 'James Conway added.');

    const first = takeFlash(p.cookies);
    const second = takeFlash(p.cookies);

    expect(first).toBe('James Conway added.');
    expect(second).toBeNull();
  });

  it('returns nothing on an ordinary visit', () => {
    const cookies = cookieJar();

    const message = takeFlash(cookies);

    expect(message).toBeNull();
  });
});
