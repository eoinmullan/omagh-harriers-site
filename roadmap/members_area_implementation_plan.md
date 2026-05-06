# Members Area — Implementation Plan

Phases are intended to be shipped independently. Each phase is self-contained and leaves the site in a working state.

## Deployment Architecture

| App | Subdomain | Hosting | Backend |
|---|---|---|---|
| Public site + members area | `omaghharriers.com` | Cloudflare Pages (SSR via Pages Functions) | Supabase |
| Training sign-in PWA | `signin.omaghharriers.com` | Cloudflare Pages (separate project, static) | Same Supabase project |

**Admin area** (`/admin/*`) lives inside the club site as SSR Astro pages — desktop management tasks (member list, credit adjustments, history). Gated by an admin role check in middleware.

**Training sign-in PWA** is a separate React + Vite app — mobile-first, installable, used at sessions to mark attendance and record cash payments. Members use it without ever seeing the URL. Shares the same Supabase project via role-based access.

## End-state Folder Structure

```
omagh-harriers-site/
├── apps/
│   ├── site/                       # Astro SSR — omaghharriers.com (Pages project A)
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   ├── layouts/
│   │   │   ├── components/         # members-area UI
│   │   │   ├── lib/                # supabase client, auth helpers, stripe
│   │   │   ├── middleware.ts
│   │   │   └── styles/
│   │   ├── public/
│   │   ├── astro.config.mjs
│   │   ├── tsconfig.json           # extends ../../tsconfig.base.json
│   │   └── package.json            # @omagh/site
│   └── signin/                     # React+Vite PWA — signin.omaghharriers.com (Pages project B)
│       ├── src/
│       ├── public/
│       ├── vite.config.ts
│       └── package.json            # @omagh/signin
├── packages/
│   └── supabase/                   # generated DB types, client factory, RLS helpers
│       └── package.json            # @omagh/supabase
├── supabase/
│   └── migrations/                 # SQL files, informally tracked
├── .github/
│   └── workflows/
│       └── ci.yml                  # typecheck + build on PR (deploys stay with Pages)
├── roadmap/
├── pnpm-workspace.yaml
├── package.json                    # root: workspaces + shared dev deps
├── tsconfig.base.json
└── README.md
```

**CI/CD model:** two Cloudflare Pages projects, one per app, each with **Root directory** set to its `apps/<x>` subfolder. Pages handles pnpm-workspace installs natively. GitHub Actions runs typecheck + build as a PR safety net only — Pages owns deploys.

## Cost Summary

| Item | Annual cost |
|---|---|
| Domain (existing) | — |
| Cloudflare Pages | £0 (free tier covers a 40-member club many times over) |
| Supabase | £0 (free tier: 500MB DB, 50k MAU, plenty for this) |
| Stripe top-up fees | ~1.4% + 20p per transaction (e.g. 34p on a £10 top-up — paid by club, not member) |
| **Total ongoing** | **~£0/year + Stripe transaction fees** |

One-off setup: only your time. No per-seat costs, no monthly subscriptions.

---

## Phase 0 — Monorepo & CI Foundation

Restructure the repo as a pnpm monorepo so the Phase 5 PWA can live alongside, and add a thin CI safety net before SSR + Supabase + Stripe land. No code changes, no SSR yet — just the directory move, Cloudflare Pages config flip, and a typecheck/build check on PRs. Done first so that no later phase has to drag a half-built feature through a restructure.

### Monorepo restructure
- [x] Initialise pnpm workspace at the repo root (`pnpm-workspace.yaml`, root `package.json`)
- [x] Move the existing Astro site into `apps/site/`; rename its package to `@omagh/site`
- [x] Add `tsconfig.base.json` at the repo root; have `apps/site/tsconfig.json` extend it (cheap now, pays off when `apps/signin` and `packages/supabase` arrive)
- [x] Verify `pnpm dev` and `pnpm --filter @omagh/site build` work from the new location

### Cloudflare Pages cutover
- [x] In the existing Cloudflare Pages project, change **Root directory** to `apps/site`
- [x] Test on a preview deployment first (push to a branch, confirm the Pages preview builds and renders correctly) before merging to `main`
- [x] Merge the monorepo move and the Pages config change in the same window so production isn't broken between them

### CI safety net
- [x] Add `.github/workflows/ci.yml` running `pnpm install` + `pnpm -r typecheck` + `pnpm -r build` on PRs (deploys stay with Cloudflare Pages — Actions is purely a check)
- [x] No secrets needed yet; scope the workflow to typecheck + build only

> **Path-based build skipping** (Pages → Build settings → "Build watch paths") is worth setting once `apps/signin/` exists in Phase 5 so a site-only commit doesn't rebuild the PWA and vice versa. Free-tier 500 builds/month is plenty either way; this is an optimisation, not a Phase 0 blocker.

> **Don't pre-create** empty `packages/` or `apps/signin/` skeletons. Create those when Phases 4/5 actually need them.

---

## Phase 1 — SSR Foundation

Enable SSR on the existing Cloudflare Pages deployment so middleware and API routes are possible. No visible changes to the public site.

### SSR migration
- [ ] Install `@astrojs/cloudflare` (latest) in `apps/site`
- [ ] Add `output: 'server'` and the Cloudflare adapter (`directory` mode for Pages Functions) to `apps/site/astro.config.mjs`
- [ ] Audit every existing `.astro` page; add `export const prerender = true` so static pages stay statically generated under `output: 'server'`
- [ ] Verify all existing pages still build and render correctly
- [ ] Deploy and confirm live site is unaffected

---

## Phase 2 — Auth: Magic Link + Members Table

Core auth infrastructure. Members can sign in via email magic link; the allowlist is enforced via Supabase's own user table (pre-provisioned auth users + sign-ups disabled).

### Supabase setup
- [ ] Create a free Supabase project
- [ ] Add `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` to env (and Cloudflare Pages env vars)
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY` to server-side env (for Admin API calls — never exposed to client)
- [ ] Install `@supabase/supabase-js`
- [ ] Toggle **"Disable new sign-ups"** in Supabase Auth settings — Supabase will then reject any sign-in attempt from an email that doesn't already have an auth user
- [ ] Enable "Link accounts with same email" in Supabase Auth settings (so magic link and OAuth identities for the same email become one user)

### Members table (the allowlist)
- [ ] Create `members` table — `id`, `email` (unique, lowercased), `name`, `phone`, `auth_user_id`, `role` (`'member' | 'admin' | 'superuser'`, default `'member'`), `is_active`, `terms_accepted_at`, `created_at`
- [ ] Schema changes are tracked informally as SQL files in `supabase/migrations/` checked into the repo (run manually against the project)
- [ ] Export the current member list from Klubfunder (CSV)
- [ ] Seed members: for each row in the Klubfunder export, call the Supabase Admin API to create the auth user and write `auth_user_id` back to the `members` row at seed time. Mark a small number of seed rows as `admin` and one or two as `superuser`.
- [ ] Add a `custom_access_token_hook` Postgres function that injects `role` from `members` into the JWT on every token issue
- [ ] RLS: members can read their own row; policies for admin-or-superuser writes reference `auth.jwt() ->> 'role' IN ('admin', 'superuser')`; superuser-only policies reference `auth.jwt() ->> 'role' = 'superuser'`

### Auth pages and middleware
- [ ] Create `src/middleware.ts` — intercept `/members/*` and `/admin/*`, check Supabase session, look up `auth.uid()` against `members.auth_user_id`, redirect to `/signin` on missing/expired session
- [ ] Create `src/pages/signin.astro` — email input form; calls `supabase.auth.signInWithOtp()` directly (Supabase rejects non-allowlisted emails because sign-ups are disabled). Surface the rejection as an explicit "this email isn't on our member list — please contact the committee" message
- [ ] Add Turnstile CAPTCHA on the signin form (optional but recommended); rely on Supabase's per-email rate limit as a backstop
- [ ] Create `src/pages/signin/callback.astro` — exchange magic link token for session cookie
- [ ] Create `src/pages/signin/terms.astro` — first-sign-in T&Cs acceptance page; on accept, write `members.terms_accepted_at = now()` and redirect to `/members`
- [ ] Create `src/pages/terms.astro` and `src/pages/privacy.astro` — public T&Cs and privacy notice (privacy notice describes what data is held and that deletion requests go to admins)
- [ ] Middleware: after auth check, if `members.terms_accepted_at IS NULL`, redirect to `/signin/terms`
- [ ] Customise Supabase auth email templates (magic link, OTP) with Omagh Harriers branding and sender name — Supabase Auth → Email Templates
- [ ] Create `src/pages/members/index.astro` — basic gated landing page
- [ ] Add a sign-out button (calls `supabase.auth.signOut()` then redirects to `/`)
- [ ] Add Members link to nav (redirects to `/signin` when unauthenticated)
- [ ] Test: allowlisted email receives link and lands on `/members`
- [ ] Test: non-allowlisted email gets the explicit "not on member list" message
- [ ] Test: first sign-in is gated by `/signin/terms`; second sign-in skips it
- [ ] Test: sign-out clears the session and `/members` redirects to `/signin`

### Member management UI (admin)
- [ ] Create `src/pages/admin/members.astro` — list members (name, email, role, is_active), add new member, deactivate existing member
- [ ] "Add member" flow: form takes name + email + phone → server-side endpoint calls Supabase Admin API to create the auth user → writes the `members` row with the returned `auth_user_id` and role `'member'` → returns success
- [ ] "Deactivate member" flow: flips `is_active = false` on the row and revokes the Supabase auth user so they can no longer sign in
- [ ] Gate `/admin/*` to `role IN ('admin', 'superuser')` in middleware (using the JWT claim)
- [ ] Create `src/pages/admin/members/roles.astro` — superuser-only page to promote members to `admin` (or back to `member`); promoting/demoting `superuser` itself is gated to existing superusers
- [ ] Test: admin adds a new member → that email can immediately sign in via magic link
- [ ] Test: admin deactivates a member → that email can no longer sign in
- [ ] Test: a non-superuser admin cannot access `/admin/members/roles`

---

## Phase 3 — Auth: OAuth (Google, Microsoft)

One-click sign-in for the ~65%+ of members with a Google or Microsoft account. Allowlist gating is automatic: because sign-ups are disabled (Phase 2), Supabase rejects any OAuth sign-in for an email that doesn't already have a pre-provisioned auth user — no callback-side check needed.

- [ ] Register Google OAuth app in Google Cloud Console, enable in Supabase dashboard, register the Supabase OAuth callback URL
- [ ] Register Microsoft OAuth app in Azure AD (personal accounts tenant for consumer use), enable in Supabase dashboard, register the Supabase OAuth callback URL
- [ ] Add Sign in with Google / Microsoft buttons to `signin.astro`
- [ ] Test each provider end-to-end with an allowlisted account
- [ ] Test that an unrecognised email from OAuth is rejected (Supabase should refuse the sign-up automatically)

---

## Phase 4 — Training Credits

Session balance tracking, top-up history, Stripe online top-up via Astro API route, and admin tools for cash payments and session deductions.

### Data model
- [ ] Create `credit_transactions` table — `id`, `member_id`, `amount_pence` (positive for credit, negative for debit), `type` (`'top_up_stripe' | 'top_up_cash' | 'session' | 'manual_adjustment' | 'refund'`), `attendance_id` (nullable, FK → `attendance`, set when `type = 'session'`), `idempotency_key` (unique), `notes`, `created_by`, `created_at`
- [ ] RLS: members can read their own transactions; admin/superuser role can read/write all
- [ ] Create a `member_balances` view that sums `credit_transactions.amount_pence` per member

### Member-facing (transparency)
- [ ] Create `src/pages/members/credits.astro` — current balance + full transaction history with each row clearly labelled by method (Stripe vs cash) and, for session debits, the session name and date (joined via `attendance` → `training_sessions`)
- [ ] Use human-readable line formats, e.g. *"£10.00 added — paid by card via Stripe"*, *"£10.00 added — paid by cash at training, recorded by Eoin Mullan"*, *"£2.00 deducted — Monday Track Speed"*
- [ ] Link credits page from `/members` dashboard

### Stripe top-up
- [ ] Retrieve API keys from existing club Stripe dashboard (Standard account)
- [ ] Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to env
- [ ] Create `src/pages/members/topup.astro` — fixed amount buttons (£10 / £20 / £40, pending final stakeholder confirmation), creates Stripe Checkout session with `member_id` in metadata
- [ ] Create `src/pages/members/topup/success.astro` — post-payment confirmation page
- [ ] Create `src/pages/api/stripe/webhook.ts` — Astro API route, verifies Stripe signature with the service-role Supabase client, writes `top_up_stripe` transaction using the Stripe event ID as `idempotency_key`
- [ ] Register webhook endpoint in Stripe dashboard
- [ ] Test: £10 top-up via Stripe Checkout → balance updates
- [ ] Test: replay the same webhook event → no duplicate transaction (idempotency)

### Admin tools
- [ ] Create `src/pages/admin/credits.astro` — select member, record `top_up_cash` (with note) or `manual_adjustment` (with required note explaining the adjustment)
- [ ] Gate `/admin/*` to `role IN ('admin', 'superuser')` in middleware
- [ ] Test: admin records a cash payment → member balance updates and the transaction is labelled "paid by cash" on the member's credits page

---

## Phase 5 — Training Sessions, Attendance & Sign-in PWA

Introduces training sessions as first-class entities, attendance recording against them, and the standalone sign-in PWA at `signin.omaghharriers.com`. Used by club admins at training to mark attendance and record cash payments. Shares the same Supabase project. Built with offline-first idempotent writes so flaky leisure-centre wifi can't double-charge anyone.

### Supabase additions
- [ ] Create `training_sessions` table — `id`, `name`, `starts_at` (timestamptz), `location` (nullable), `created_by`, `created_at`
- [ ] Create `attendance` table — `id`, `member_id`, `session_id` (FK → `training_sessions`), `recorded_by`, `idempotency_key` (unique), `created_at`
- [ ] Add `attendance_id` FK from `credit_transactions` (added in Phase 4 schema; if not yet added, add it here) so `session` debits can be joined back to the originating attendance row
- [ ] RLS: admin/superuser role can insert/read all attendance and sessions; members can read their own attendance and any session they attended
- [ ] Members can be on multiple sessions on the same day — uniqueness is `(member_id, session_id)`, not `(member_id, date)`

### Admin: session management (in the main site)
- [ ] Create `src/pages/admin/sessions.astro` — list upcoming and past sessions, create a new session (name, starts_at, location)
- [ ] Allow editing name/location; deletion is a soft-disable, not a row drop, so attendance history stays intact

### PWA setup
- [ ] Add `apps/signin` package to the existing pnpm monorepo (created in Phase 0) — Vite + React
- [ ] Share Supabase types via a `packages/supabase` workspace package consumed by both `apps/site` and `apps/signin`
- [ ] Configure Cloudflare Pages deployment from `apps/signin`, point `signin.omaghharriers.com` at it
- [ ] Connect to the same Supabase project — admin/superuser role required
- [ ] Add Web App Manifest and service worker (PWA installable on iOS and Android)
- [ ] Implement offline write queue — IndexedDB store, flushed when connectivity returns

### PWA core features
- [ ] Admin sign-in (Supabase auth, role `admin` or `superuser` required)
- [ ] Session selector — first screen after sign-in. Lists today's sessions; admin picks one. Also offers a "Create session" shortcut for sessions that weren't pre-created
- [ ] Attendance view — list of active members for the selected session, with attendance status. One tap to mark attendance: writes an `attendance` row and a paired `credit_transactions` row of `type = 'session'` with `attendance_id` set, in a single transaction
- [ ] Record cash payment — select member, enter amount, writes a `top_up_cash` row to `credit_transactions`
- [ ] Member balance visible inline so admin knows if a member is in credit or needs to pay

### Idempotency
- [ ] Use deterministic `idempotency_key` for all writes — `attendance:{member_id}:{session_id}` and `cash:{member_id}:{client_uuid}`
- [ ] Write with `ON CONFLICT (idempotency_key) DO NOTHING` so retries / offline-then-sync never double-write
- [ ] Test: queue an attendance write offline → bring app online → exactly one row appears
- [ ] Test: trigger sync twice in rapid succession → no duplicate
- [ ] Test: create a session in the PWA while offline → syncs as one session (deterministic client-generated `id`), attendance rows reference that `id`

---

## Phase 6 — Admin Reporting

A read-only reporting area inside `/admin` for committee operational needs. No new tables — these are queries and views over `members`, `credit_transactions`, `training_sessions`, and `attendance`.

- [ ] Create `src/pages/admin/reports.astro` — index page linking to the reports below
- [ ] Attendance by session — pick a session, see who attended and who didn't
- [ ] Attendance by member — pick a member + date range, see all sessions attended
- [ ] Member balances — current snapshot, with a sub-list of members in arrears (negative balance)
- [ ] Top-up summary — totals over a date range, split by method (Stripe vs cash)
- [ ] Session summary — sessions per week, headcounts, trends over time
- [ ] CSV export on each report
- [ ] Gate `/admin/reports` to `role IN ('admin', 'superuser')` in middleware (already covered by `/admin/*` rule)

---

## Phase summary

| Phase | What ships | Key dependency |
|---|---|---|
| 0 | pnpm monorepo, Cloudflare Pages root dir flip, GitHub Actions typecheck/build CI | None |
| 1 | SSR foundation on Cloudflare Pages | Phase 0 |
| 2 | Magic link auth + Supabase members table (3-tier roles: member / admin / superuser) | Supabase project |
| 3 | Google / Microsoft OAuth | OAuth app registrations |
| 4 | Training credits, Stripe top-up, admin credit tools, member transparency view | Stripe API keys |
| 5 | Training sessions, attendance, sign-in PWA | Phase 4 schema |
| 6 | Admin reporting area | Phase 5 schema |
