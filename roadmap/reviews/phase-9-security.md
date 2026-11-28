# Phase 9 — Security review: signing in with a code

Reviewed at `0270d46` (`main`), 27 November 2026.

Scoped to what Phase 9 added: the code in the sign-in email, the code box on
`/signin`, `POST /signin/send-email`, the registrar app's signed-out screen
(`SignedOut.tsx`, `Turnstile.tsx`), and the rules in `lib/auth/sign-in-code.ts`,
`sign-in-email.ts`, `sign-in-email-steps.ts` and `after-sign-in.ts`.

Judged against the trust model in `CLAUDE.md`. Sign-in is the one place where
everybody is an outsider until it succeeds, so everything here is in scope.

Read against the code, and probed against the dev server and the live site
with an address that isn't on the member list, so nothing was sent and no
member's sign-in was touched.

One high finding, one medium, one low. The high and the medium are fixed.

---

## S9-1. The live site doesn't check the security check

**Severity: high.** Round 1's S2, which this pass found is live rather than
latent.

**Fixed, 27 November 2026.** `judgeCaptcha` in `sign-in-email.ts` fails
closed, with a test for each case: a missing secret or an unreachable
Cloudflare refuses with *"Sign-in can't run its security check right now"*,
and logs which it was. The secret is read from `locals.runtime.env` first.
`OPERATIONS.md` says it must be set, and what members see if it isn't. Steps
4 and 5 below are for after the deploy.

A request to the live site with an empty Turnstile token gets past the check:

```sh
curl -X POST -H 'Content-Type: application/json' \
  --data '{"email":"zz-no-such-member@example.com","captchaToken":""}' \
  https://omaghharriers.com/signin/send-email
# {"sent":false,"problem":"We couldn't find that email on our member list. …"}
```

With the check working, that answer would have been *"Please complete the
security check and try again."* Instead it went on to the member list, which
means the check returned true.

The cause is in `turnstileAccepts` (`lib/auth/sign-in-email-steps.ts`):

```ts
if (!import.meta.env.TURNSTILE_SECRET_KEY) return true;
```

It reads the secret from `import.meta.env` only. On Cloudflare Pages a secret
arrives at runtime on `locals.runtime.env`, which is why
`createSupabaseAdminClientFromLocals` reads the service-role key from there
first. This one isn't read from there, so either it isn't set in the Pages
project or the code can't see it. Either way the line above treats it as
missing and waves every request through. Round 1 flagged exactly this
fail-open (S2), and it wasn't fixed. Phase 9 carried it into the new endpoint.

What's exposed while it lasts, to anyone with a script:

- **Which addresses are members, lapsed members or neither**, as fast as they
  can ask (see S9-3 for why the new endpoint makes that easier)
- **Sign-in emails to any member, on demand**, limited only by Supabase's
  one-a-minute per address and the project's email rate limit, which is still
  *to confirm* in `OPERATIONS.md`. Each one costs a send through Resend
- **Spending a member's code before they use it.** Each new email replaces the
  last code, so somebody who knows a registrar's address can keep their sign-in
  from working, one email a minute

**Fix:**

1. Read the secret as the service-role key is read:
   `locals.runtime?.env?.TURNSTILE_SECRET_KEY ?? import.meta.env.TURNSTILE_SECRET_KEY`
2. **Fail closed.** Outside development, a missing secret refuses the request
   with a sentence, rather than passing it. Put that decision in
   `sign-in-email.ts`, where it's tested, not in the wiring
3. A failed call to Cloudflare's siteverify (network, a non-JSON answer)
   refuses too. Today it throws, which is a 500 page
4. Confirm `TURNSTILE_SECRET_KEY` is set in the Pages project, as an encrypted
   variable, and record it in `OPERATIONS.md`
5. Re-run the `curl` above after the deploy. It should come back with the
   security check sentence

---

## S9-2. On `/signin`, Supabase counts the wrong address

**Severity: medium.**

**Fixed, 27 November 2026.** `/signin` checks the code in the browser, as the
registrar app does, and goes to `/members`. The server no longer calls
`verifyOtp` for a typed code; a code posted to it means the page's script
didn't run, and it says the code needs JavaScript. Checked in the dev server:
a short code, a wrong code and the right one with a space in it.

`OPERATIONS.md` says what protects a 6-digit code: its lifetime, a new email
replacing it, and **Supabase's per-IP rate limit on verifying**. That limit
counts the address the request came from.

The registrar app verifies in the browser, so Supabase sees the member's own
address. `/signin` doesn't: the form posts the code to our server, and the
server calls `verifyOtp`. Supabase sees a Cloudflare Worker's address, not
the guesser's. That's wrong in both directions:

- If Workers reach Supabase from many addresses, an attacker posting guesses
  to `/signin` has them spread across Cloudflare's addresses, and the per-IP
  limit stops nothing. A million codes over an hour is about 280 guesses a
  second, so a determined script has a real chance against one email
- If they reach it from a few, an attacker can use up the limit for those
  addresses and lock everybody out of signing in by code on `/signin`

Which one applies doesn't matter: either way the limit `OPERATIONS.md` relies
on isn't doing its job on the website. Our own limit in the site wouldn't fix
it, for the reason `OPERATIONS.md` already gives: a guesser can call Supabase's
`/verify` directly. The point is that when they do, they're counted.

**Fix:** verify the code in the browser on `/signin`, as the registrar app
does. The browser client writes the session to the site's cookies, which is
how the app's sign-in already reaches the members' area. The code branch in
`signin.astro`'s POST goes away, and with it the only place our server
verifies a typed code. The page needs JavaScript for this, which it already
does, for Turnstile. `whereToAfterSignIn` moves to a redirect the browser
follows after `SIGNED_IN`, or the page reloads into the middleware, which
already sends anybody without accepted terms to `/signin/terms`.

---

## S9-3. The new endpoint answers the member-list question as JSON

**Severity: low, once S9-1 is fixed.**

`POST /signin/send-email` returns `{ sent, problem }`, and `problem` is one of
three sentences: not on the list, lapsed, or (if sent) nothing. That's the same
answer `/signin` gives (round 1 privacy, P6), but as JSON, which is easier to
script than a page. Turnstile is what bounds it, which is why S9-1 matters more
than it did when only the page asked.

P6 asked the committee to decide between the helpful messages and a single
answer for every address, and to delete the 2-second delay if the helpful ones
stay, since it only adds a difference. Neither has happened: the delay is still
there (`REFUSAL_DELAY_MS`) and still runs only on a refusal.

**Fix:** none beyond S9-1 now. When P6 is decided, the endpoint follows the
page, since both call `sendSignInEmail`.

---

## Worth knowing

- **Link scanners can spend a code.** Some mail services (Outlook's Safe Links,
  some workplace filters) open every link in an email before the reader sees
  it. Supabase's link spends the token when it's opened, so the code is
  already spent when the member types it, and the refusal's *"If you tapped the
  link"* doesn't describe what happened. If somebody reports that codes never
  work for them, ask whose email service they use. Not a security problem,
  but it will look like one
- **The dev server doesn't check the origin of a form post.** The same
  cross-site posts that the live site refuses with a 403 get a 200 locally, so
  test origin checks against a deployment, not `localhost:4321`

---

## What stood up

- **Cross-site posts are refused on the live site.** A form post of an email
  and code to `/signin` from another origin gets a 403, so nobody can sign a
  visitor into the attacker's own account (login CSRF). So does a `text/plain`
  post shaped as JSON to `/signin/send-email`. A real JSON post from another
  site needs a preflight, and the endpoint grants none
- **The code never reaches a URL or a log.** It's posted in a form body or sent
  by the browser client. The server logs Supabase's status and error code, not
  the token
- **No new logins.** `signInWithOtp` sends with `shouldCreateUser: false`, and
  sign-ups are off in the dashboard
- **No open redirect.** After a code is accepted the destination is one of two
  fixed paths (`destinationAfterSignIn`), never something from the request
- **A lapsed member can't sign in by code.** The sync bans them in Supabase
  Auth, `verifyOtp` refuses with `user_banned`, and the middleware checks
  `is_active` on every gated page regardless
- **Showing the code adds no exposure**, as `OPERATIONS.md` argues: every
  magic-link email already had a code behind it
- **Turnstile's script on the registrar page** loads only on the signed-out
  screen, from Cloudflare, which already serves the whole site
- **`/signin/send-email` answers `Cache-Control: no-store`**, so no answer about
  one address is cached and handed to another request
