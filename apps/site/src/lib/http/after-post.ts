// Post/Redirect/Get for the admin pages.
//
// An admin page used to render the result of its own POST. Reloading it, the
// back button, or "Confirm Form Resubmission" sent the form again, and
// creating a session that way made a second, identical one, which splits a
// training night between two registrars. After a form succeeds, the page now
// redirects to itself with a 303, so the browser's next request is a GET and
// a reload just reloads.
//
// The confirmation can't stay in a local variable across the redirect, so it
// goes in a cookie that lives for a minute and is read once. Not in the URL:
// messages like "James Conway added." would otherwise end up in request logs
// and browser history.
//
// A form that fails still renders its own result, keeping what was typed and
// the reason, because resubmitting a failure does no harm.

const FLASH_COOKIE = 'admin_flash';

export interface FlashCookies {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options?: Record<string, unknown>): void;
  delete(name: string, options?: Record<string, unknown>): void;
}

interface PostedPage {
  cookies: FlashCookies;
  url: URL;
  redirect(path: string, status: 303): Response;
}

/**
 * Back to the page that was posted, or to `to` when the form made something
 * that has a page of its own, such as a new squad.
 */
export function redirectAfterPost(page: PostedPage, confirmation: string, to?: string): Response {
  page.cookies.set(FLASH_COOKIE, confirmation, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.env.DEV,
    maxAge: 60,
  });
  return page.redirect(to ?? page.url.pathname + page.url.search, 303);
}

/** The confirmation a redirect left behind, read once. */
export function takeFlash(cookies: FlashCookies): string | null {
  const confirmation = cookies.get(FLASH_COOKIE)?.value;
  if (confirmation === undefined) return null;
  cookies.delete(FLASH_COOKIE, { path: '/' });
  return confirmation;
}
