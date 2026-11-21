# Round 3 — Operational resilience

Reviewed at `8549a1f` (`main`). The roadmap's question: *what breaks at seven
on a wet Monday.* It names four risks: Supabase unreachable mid-session; the
`0003` access-token hook, registered by hand and in no migration; the
Microsoft secret, which expires on a date held in a constant; and a bad
content deploy taking the registrar app down now that it shares an origin with
the website.

Checked by reading the code and config, plus Supabase's public auth settings
endpoint. Several findings are **checks only you can make in the Supabase or
Cloudflare dashboard**, and they're marked as such. Nothing here was changed
in production, because a usability test was running against it.

---

## What already holds on a bad night

Most of the wet-Monday failures are already designed for, and the reviews
this round closed the gaps they found:

| What goes wrong | What happens |
|---|---|
| **No signal at the track** | The service worker opens the app from cache. Today's sessions and the night's list come back from their last snapshot, marked with the time they were saved. Ticks and cash queue and retry for as long as it takes. Adding a guest tells the registrar to write the name down. |
| **Signal, but Supabase's database is down** | Since Q1, PostgREST's 503 and 504 responses and the "try again" database errors retry instead of being dropped, and since F3 anything genuinely refused is named on screen. |
| **The registrar's phone dies** | `/admin/sessions/[id]/sheet` prints the night for paper, done by an admin beforehand. Paper is the fallback, and the record still has to be entered afterwards. |
| **Two phones on one session** | The 20-second refresh, plus the untick alias (`0019`), keep them from contradicting each other. |
| **An admin page can't reach the database** | Since F2 it fails with `500.astro` instead of showing an empty club. |
| **The Microsoft secret expires** | The button withdraws itself on the date in `microsoft-oauth.ts`, and email and Google sign-in carry on. |
| **Somebody tries to sign up** | Signups are disabled (`disable_signup: true`), so the only logins are the ones the sync creates. |

---

## OR1. Sign-in emails may only reach the Supabase team

**Severity: possibly a go-live blocker. Resolved: the user has set up Resend as the SMTP provider.**

Email sign-in is switched on and the sign-in page relies on it: every member
without Gmail or Outlook signs in that way. What the settings endpoint can't
show is **how** Supabase sends those emails. Its built-in sender is for
development only: it delivers only to members of the Supabase project team, at
a few emails an hour. Unless a custom SMTP provider is configured, the first
parent who isn't on the team will request a sign-in link and never get it.

Nothing in this repo sends one, and the club's email setup (Cloudflare Email
Routing) only receives mail, so it's no help here. It wasn't tested, because
that would mean emailing a real member.

**Check** Authentication → Emails → SMTP Settings. If custom SMTP isn't set,
set one up (Resend, Postmark or similar, on a domain the club controls) and
raise the email rate limit to match. Then send a sign-in link to an address
that isn't on the Supabase team.

## OR2. One Supabase project is both development and production

**Severity: high once the club depends on it.**

> **Decision: deferred.** Fine while the members' area is being demoed. Whether to go
> ahead is decided after the demo, and a development project comes with that decision.

There's one project. Every migration this round was applied straight to it,
the test data lives in it, and today's usability test is writing permanent
ledger rows into it against real members' names. That was right while
everything was test data, but it can't continue past go-live:

- **A migration has nowhere to be tried first.** `0014` broke the registrar's
  session picker the moment it was applied, and only a browser check found it.
  After go-live that's a live training night.
- **The test data has to go**: the test ledger rows (which need a `TRUNCATE`,
  and only then B5's guard), the ZZ squads and sessions, and the usability
  test's ticks.

**Before go-live:** create a second Supabase project for development, apply the
migrations there first, and point local `.env` at it. Clean production's test
data, then add B5.

## OR3. The auth setup lives only in the dashboard

**Severity: medium. Fixed.**

There's no `supabase/config.toml`. Every setting that makes sign-in work was
made by hand in the dashboard, and nothing in the repo records it:

- the access-token hook (`public.custom_access_token_hook`), which `0003` says
  to register by hand
- SMTP and the email rate limit (OR1)
- site URL and redirect URLs (`/signin/callback`)
- Google and Microsoft (Azure) client IDs and secrets
- signups disabled, and token lifetimes

If the project were ever restored to a new one, or a setting changed by
mistake, it would fail **silently and misleadingly**. The worst case is the
hook. Without it, no token carries an `app_role`, so RLS refuses every
registrar write, and the registrar app tells every registrar *"…is a club
member rather than a registrar. If you've been asked to take sign-ins, a club
admin can add that to your account."* The admin checks, sees the registrar
role is already set, and nobody at the gate knows the real cause. The admin
pages keep working, because they read roles from the database, which makes it
harder still to see.

**Fix, two parts:**

1. **Write the settings down.** A short runbook in the repo listing every
   dashboard setting above, with where it lives. A `config.toml` plus
   `supabase config push` would also work, but a partial file pushes defaults
   over settings it leaves out, so the runbook is the safer first step.
2. **Make the registrar app tell the two cases apart.** A member's token says
   `app_role: member`, but with no hook there's no `app_role` claim at all.
   `registrar.ts` can tell them apart, and the screen should say *"Club roles
   aren't reaching this app — this isn't your account. Tell whoever looks after
   the club's Supabase."* That's a small, testable change.

**Done, both parts.** `OPERATIONS.md` lists every dashboard setting the site
depends on, marking what was confirmed (signups off; email, Google and
Microsoft on) and what's still to confirm (SMTP, rate limit, URLs, token
lifetime, the Pages build command). It also has a table for a broken training
night and the rollback. In the app, `roleClaimIsMissing` (four tests) tells a
missing claim from a member or `none`, and `RolesNotArriving` says it's not the
registrar's account, to take the night on paper, and which setting to fix.
That screen only appears when the hook is broken, so it's covered by the
tests and `astro check`, not seen live.

## OR4. A deploy doesn't wait for the tests

**Severity: medium. Check the Cloudflare Pages build command. Agreed; the build command is a dashboard change, recorded in `OPERATIONS.md`, and the rollback is written down there.**

**Done, 21 November 2026.** The Pages build command is `pnpm build:deploy`, which runs `astro check`, the tests and then the build. The script is in `apps/site/package.json`, because the Pages root directory is `apps/site`. The first attempt put it in the workspace root and failed with "command not found", which kept the previous deployment live, as the gate should. The build command was `npm run build` before, which ran no checks.

Cloudflare Pages builds and deploys `main` itself. GitHub Actions runs the
typecheck, tests and build separately, and since Q2 it runs on every push.
But neither waits for the other: a push whose tests fail still goes live if
it builds. That matters because the registrar app is part of the same
deploy, so an edit to the website's training times redeploys the registrar
app too.

The service worker doesn't soften this. Navigations are network-first, which
is deliberate so that fixes arrive the moment there's signal, so a bad
deploy reaches every phone that's online as soon as it's out.

**Fix:**

- Make the Pages build command run the tests first, e.g. `pnpm -r test &&
  pnpm -r build`. A failing test then fails the Pages build, and Pages
  keeps the previous deployment live. The suite takes under a second.
- **Write down the rollback.** Cloudflare Pages → the project → Deployments →
  a previous deployment → *Rollback to this deployment*. It's instant and
  doesn't need a rebuild, so it's the fastest fix for a broken training night.

## OR5. Backups, and whether the project can pause

**Severity: medium. Check the Supabase plan.**

> **Decision: accepted for now.** The project is on the Free plan. If the club goes live,
> there's activity every week until the summer, so pausing isn't a risk before then;
> reconsider before the summer. Recorded in `OPERATIONS.md`.

`credit_transactions` is the club's financial record. Nothing in the repo
backs it up, and how much Supabase does depends on the plan:

- **On the Free plan, a project pauses after a week without activity**, and a
  paused project needs someone to restore it in the dashboard before anything
  works again. A quiet summer week, with juniors off and few seniors training,
  is how it happens. The first anyone hears of it is a registrar at the gate.
- **Automatic daily backups and point-in-time recovery depend on the plan.**
  Check what this project has.

**Fix:** confirm the plan. If it's Free, either move to Pro before go-live
(no pausing, daily backups) or add a weekly scheduled request to keep it
awake. Either way, an occasional off-site export of the ledger (a CSV of
`credit_transactions` kept by the treasurer) costs nothing and doesn't depend
on any plan.

## OR6. Nothing will remind anyone about the Microsoft secret

**Severity: low. Due 16 November 2028. Fixed.**

`MICROSOFT_CLIENT_SECRET_EXPIRES_ON` is 16 November 2028. When it passes,
the button withdraws itself and nobody is locked out, which is the right
behaviour. But nothing warns ahead of time, and renewing in Azure takes a few
minutes only if someone remembers.

**Done.** `daysUntilMicrosoftSecretExpires` is tested, and a test using
today's date fails once 60 days or fewer are left. Its failure message
carries the renewal steps. Proved by moving the date to 30 days away: the test
failed with *"…expires in 29 days. Azure portal -> App registrations…"*. The
file was then restored byte-for-byte.

**Fix:** a unit test that starts failing 60 days before the date. CI now runs
on every push, so the first push in that window flags it, with the renewal
steps in the failure message. Also put a calendar reminder on the club's
account.

## OR7. An expired token can look like a refusal

**Severity: low. Fixed.**

Access tokens last an hour. supabase-js refreshes before each request when
it's online, so a long session is fine. The edge case is Supabase Auth
unreachable while its API isn't: the refresh fails, the request goes out with
an expired token, PostgREST answers 401, and `isWorthRetrying` treats a 401
as a refusal, so the write is dropped, with F3's notice. That's rare, and the
notice makes it visible. Treating a 401 *"JWT expired"* (`PGRST301`) as
"refresh and retry" would close it. One more test case in `queue.ts`.

**Done.** `isWorthRetrying` retries a 401 whose message says *"JWT
expired"*, and still refuses a 401 for a token that's wrong rather than
expired. It's matched on the message because the code changed between
PostgREST versions, and this project runs v14.5. A live expired-token reply
couldn't be produced: a hand-made token fails its signature check
(`PGRST301`, *"No suitable key"*) before PostgREST looks at the expiry, and
a real one takes an hour to expire. Covered by three tests.

---

## Before go-live, in order

1. **OR1:** confirm or set up custom SMTP, and test a sign-in link to a
   non-team address.
2. **OR5:** confirm the plan and backups. Move to Pro, or add a keep-alive and
   an export.
3. **OR2:** create a development project, then clean production's test data
   (`TRUNCATE`, then B5).
4. **OR4:** gate the Pages build on the tests, and write down the rollback. **Done.**
5. **OR3:** write the dashboard runbook, and make the registrar app say when
   roles aren't reaching it.
6. **OR6, OR7:** at any point.
