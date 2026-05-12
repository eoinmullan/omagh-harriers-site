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
- [x] Install `@astrojs/cloudflare` in `apps/site` (pinned to `^12` because `13.x` requires Astro 6; we're on Astro 5)
- [x] Add `output: 'server'` and the Cloudflare adapter to `apps/site/astro.config.mjs` (the old `mode: 'directory'` option no longer exists in v12 — adapter auto-targets Pages and emits `_routes.json`)
- [x] Audit every existing `.astro` page; add `export const prerender = true` so static pages stay statically generated under `output: 'server'`
- [x] Verify all existing pages still build and render correctly
- [x] Deploy and confirm live site is unaffected

---

## Phase 2 — Auth: Magic Link + Members Table

Core auth infrastructure. Members can sign in via email magic link; the allowlist is enforced via Supabase's own user table (pre-provisioned auth users + sign-ups disabled). Klubfunder CSV exports are reconciled into the `members` table by a sync script that handles both the initial seed and ongoing weekly/monthly updates.

- [x] See [members_area_phase_2.md](./members_area_phase_2.md) for the detailed PR-by-PR breakdown

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

Session balance tracking, top-up history, Stripe online top-up via Astro API route, and admin tools for cash payments and session deductions. Balances are held **per principal** (the household), not per member — one parent tops up once and any of their members can draw from it. An admin credit-transfer feature also belongs here, used to move a stranded balance when a household's contact email changes in Klubfunder.

### Data model
- [ ] Create `credit_transactions` table — `id`, `principal_id`, `amount_pence` (positive for credit, negative for debit), `type` (`'top_up_stripe' | 'top_up_cash' | 'session' | 'manual_adjustment' | 'refund' | 'transfer_in' | 'transfer_out'`), `member_id` (nullable, set when the transaction is tied to a specific member — typically `'session'`), `attendance_id` (nullable, FK → `attendance`, set when `type = 'session'`), `idempotency_key` (unique), `notes`, `created_by`, `created_at`
- [ ] RLS: principals can read transactions for their own household; admin/superuser role can read/write all
- [ ] Create a `principal_balances` view that sums `credit_transactions.amount_pence` per principal

### Member-facing (transparency)
- [ ] Create `src/pages/members/credits.astro` — current balance + full transaction history with each row clearly labelled by method (Stripe vs cash) and, for session debits, the session name and date (joined via `attendance` → `training_sessions`)
- [ ] Use human-readable line formats, e.g. *"£10.00 added — paid by card via Stripe"*, *"£10.00 added — paid by cash at training, recorded by Eoin Mullan"*, *"£2.00 deducted — Monday Track Speed"*
- [ ] Link credits page from `/members` dashboard

### Stripe top-up
- [ ] Retrieve API keys from existing club Stripe dashboard (Standard account)
- [ ] Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to env
- [ ] Create `src/pages/members/topup.astro` — fixed amount buttons (£10 / £20 / £40, pending final stakeholder confirmation), creates Stripe Checkout session with `principal_id` in metadata
- [ ] Create `src/pages/members/topup/success.astro` — post-payment confirmation page
- [ ] Create `src/pages/api/stripe/webhook.ts` — Astro API route, verifies Stripe signature with the service-role Supabase client, writes `top_up_stripe` transaction using the Stripe event ID as `idempotency_key`
- [ ] Register webhook endpoint in Stripe dashboard
- [ ] Test: £10 top-up via Stripe Checkout → balance updates
- [ ] Test: replay the same webhook event → no duplicate transaction (idempotency)

### Admin tools
- [ ] Create `src/pages/admin/credits.astro` — select principal, record `top_up_cash` (with note) or `manual_adjustment` (with required note explaining the adjustment)
- [ ] **Credit transfer** — select a source principal and a target principal, optional amount (defaults to the full source balance), required note. Writes paired `transfer_out` (negative) and `transfer_in` (positive) rows referencing each other via `notes`. Used when a household's contact email changes in Klubfunder and the balance needs to follow them.
- [ ] Gate `/admin/*` to `role IN ('admin', 'superuser')` in middleware
- [ ] Test: admin records a cash payment → principal balance updates and the transaction is labelled "paid by cash" on the credits page
- [ ] Test: admin transfers a balance from principal A to principal B → both balances update, both transactions appear in each principal's history

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
