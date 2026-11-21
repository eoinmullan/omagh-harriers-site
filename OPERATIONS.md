# Operations

What isn't in the code: every setting that lives only in a dashboard, and what
to do when a training night goes wrong. If the Supabase project or the
Cloudflare Pages project ever had to be rebuilt, this is the list to work
through. Round 3's operational resilience review (OR3) found that none of it
was written down.

Items marked **to confirm** weren't visible from the code or the public
endpoints. Fill them in from the dashboard.

---

## When a training night goes wrong

Work down this list. The first match is almost always the cause.

| What the registrar sees | Cause | Fix |
|---|---|---|
| *"Club roles aren't reaching this app"* | The access-token hook isn't running | Supabase → Authentication → Hooks → re-enable **Customize Access Token** with `public.custom_access_token_hook`. Registrars must sign out and in again, or wait up to an hour for their token to refresh. |
| The app is blank or broken for everyone, and it worked yesterday | A bad deploy | Cloudflare → Workers & Pages → the site → **Deployments** → the last good deployment → **Rollback to this deployment**. Instant, no rebuild. Then find the bad commit. |
| *"…wasn't saved"* notices piling up, or nothing loads but the internet works | Supabase is down, or the project is **paused** | Check supabase.com/dashboard. A paused Free-plan project shows a *Restore* button. Meanwhile take the night on paper (`/admin/sessions/[id]/sheet`, printed beforehand). |
| Members say their sign-in link never arrives | Email sending (see SMTP below) | Check Supabase → Authentication → Emails → SMTP, and the email rate limit. |
| The Microsoft button has gone from the sign-in page | Its client secret's date has passed | See *Microsoft sign-in* below. Email links and Google keep working. |

**Paper is the fallback, not the record.** Whatever's written on the sheet has
to be entered in the app afterwards, or the ledger never hears about the night.

---

## Supabase dashboard

Project ref `jwjkyiushsrtuvqdtwsx`, **West EU (Ireland)**, on the **Free plan**.
There is no `supabase/config.toml`, so none of this is in the repo.

| Setting | Where | Value |
|---|---|---|
| **Access-token hook** | Authentication → Hooks → Customize Access Token (JWT) Claims | **Enabled**, Postgres function `public.custom_access_token_hook`. Defined in migrations `0003` and `0004`; registering it is manual. Without it no token carries `app_role`, RLS refuses every registrar write, and the registrar app shows *"Club roles aren't reaching this app"*. |
| **New sign-ups** | Authentication → Sign In / Providers | **Off**. Confirmed: `disable_signup: true`. Only the Klubfunder sync and the admin area create logins. |
| **Email provider** | Authentication → Sign In / Providers → Email | **On** (magic links). Confirmed. |
| **SMTP** | Authentication → Emails → SMTP Settings | **Resend.** Confirmed by the user on 20 November 2026. Supabase's built-in sender only delivers to the project's team members, a few an hour, so a custom provider is required (OR1). |
| **Email rate limit** | Authentication → Rate Limits | **To confirm.** Raise it to match the SMTP provider once one is set. |
| **Site URL** | Authentication → URL Configuration | **To confirm.** Should be `https://omaghharriers.com`. |
| **Redirect URLs** | Authentication → URL Configuration | **To confirm.** Must allow `https://omaghharriers.com/signin/callback` and, for local development, `http://localhost:4321/signin/callback`. Both sign-in paths in `signin.astro` return there. |
| **Google** | Authentication → Sign In / Providers → Google | **On**. Confirmed. The client ID and secret come from the Google Cloud console. |
| **Microsoft (Azure)** | Authentication → Sign In / Providers → Azure | **On**. Confirmed. The client ID and secret come from the Azure portal. The secret expires; see below. |
| **Token lifetime** | Authentication → Sessions / JWT | **To confirm.** The app assumes the default, one hour, refreshed automatically. |

**The Free plan pauses a project after a week without activity**, and doesn't
include the backups a paid plan does. That's accepted for now (OR5): while
the club trains, there's activity every week. **Reconsider before a long
quiet spell, such as the summer**, or add a weekly keep-alive request. An
occasional CSV export of `credit_transactions`, kept by the treasurer, is the
backup that doesn't depend on the plan.

---

## Cloudflare Pages

| Setting | Value |
|---|---|
| **Production branch** | `main`. Every push to `main` deploys. |
| **Build command** | `pnpm build:deploy`. It runs the typecheck and the tests before the build, the same checks as CI, so a failing check fails the Pages build and the previous deployment stays live (OR4). The steps are in `apps/site/package.json`, so changing them is a commit, not a dashboard edit. |
| **Root directory** | `apps/site`. The build command runs there, so the script has to live in the site's `package.json`, not the workspace root's. |
| **Environment variables** | `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`. The secret key is the service role's. If it's ever rotated in Supabase, update it here and redeploy. |

**Rollback:** Deployments → a previous deployment → *Rollback to this
deployment*. Every deployment is kept, so it's immediate. Use it before
debugging.

The registrar app at `/registrar/` is part of the same deployment as the
website, so **any deploy, including a change to training times, redeploys
it.** Its service worker fetches pages from the network first, so a bad
deploy reaches every phone that's online straight away. A rollback reaches
them the same way.

---

## Applying a migration

Migrations in `supabase/migrations/` are applied to the live project by hand,
in order, before the code that needs them is pushed. A push deploys straight
away, and code that calls a function the database doesn't have yet has its
writes refused. `0023` is one of these: the registrar app's guest ticks call
`sign_in_guest` and `undo_guest_sign_in`.

---

## Test data, and clearing it before go-live

Two SQL scripts in `supabase/scripts/`, run in the Supabase **SQL Editor**.
They aren't migrations, because they must never run against a fresh database.
Nothing else can run them: the ledger's append-only trigger refuses every
DELETE, the service-role key included.

| Script | What it does |
|---|---|
| `remove-zz-test-data.sql` | Removes the ZZ test records (squads, sessions, a household and its member and login, a guest) and every sign-in and ledger row that hangs off them. Switches the two guarding triggers off inside its own transaction and back on before it ends. |
| `clear-training-data.sql` | **Once, at go-live.** Clears every session, sign-in, guest and ledger row, so every balance starts at £0.00. Keeps households, members, logins, roles, squads and squad places. Irreversible once committed, short of restoring a backup. |

Both are dry runs as written: they make every change, then stop with an error
listing what they changed, and the error undoes it all. The SQL Editor shows
only the last result, which is why the counts come back as an error. To run
one for real, uncomment its `SET LOCAL omagh.confirm` line.

Both were tested against a local copy of the schema, built from the
migrations, before they were run live.

---

## Microsoft sign-in

Azure caps an OAuth client secret at 24 months. The date it expires is
`MICROSOFT_CLIENT_SECRET_EXPIRES_ON` in
`apps/site/src/lib/auth/microsoft-oauth.ts`: currently **16 November 2028**.
On that date the button withdraws itself, so nobody is locked out.

**A test starts failing 60 days before.** `microsoft-oauth.test.ts` checks
how long is left, so the first push or CI run in that window fails with
these steps:

1. Azure portal → App registrations → the club's app → Certificates & secrets
   → **New client secret**.
2. Supabase → Authentication → Sign In / Providers → Azure → paste the new
   secret.
3. Move `MICROSOFT_CLIENT_SECRET_EXPIRES_ON` to the new secret's expiry date,
   and push.
