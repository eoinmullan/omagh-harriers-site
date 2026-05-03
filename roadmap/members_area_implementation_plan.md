# Members Area — Implementation Plan

Phases are intended to be shipped independently. Each phase is self-contained and leaves the site in a working state.

## Deployment Architecture

| App | Subdomain | Hosting | Backend |
|---|---|---|---|
| Public site + members area | `omaghharriers.com` | Cloudflare Workers | Supabase |
| Training sign-in PWA | `signin.omaghharriers.com` | Cloudflare Pages (separate project) | Same Supabase project |

**Admin area** (`/admin/*`) lives inside the club site as SSR Astro pages — desktop management tasks (member list, credit adjustments, history). Gated by an admin role check in middleware.

**Training sign-in PWA** is a separate React + Vite app — mobile-first, installable, used at sessions to mark attendance and record cash payments. Members use it without ever seeing the URL. Shares the same Supabase project via role-based access.

## Cost Summary

| Item | Annual cost |
|---|---|
| Domain (existing) | — |
| Cloudflare Workers / Pages | £0 (free tier covers a 40-member club many times over) |
| Supabase | £0 (free tier: 500MB DB, 50k MAU, plenty for this) |
| Stripe top-up fees | ~1.4% + 20p per transaction (e.g. 34p on a £10 top-up — paid by club, not member) |
| **Total ongoing** | **~£0/year + Stripe transaction fees** |

One-off setup: only your time. No per-seat costs, no monthly subscriptions.

---

## Phase 1 — SSR Foundation

Switch the site from static to server-side rendering on Cloudflare Workers so middleware and API routes are possible. No visible changes to the public site.

- [ ] Install `@astrojs/cloudflare` (latest — Workers, not Pages)
- [ ] Add `output: 'server'` and Workers adapter to `astro.config.mjs`
- [ ] Migrate Cloudflare Pages project to a Cloudflare Workers project (re-link GitHub repo, set env vars, point DNS)
- [ ] Verify all existing pages still build and render correctly
- [ ] Deploy and confirm live site is unaffected

---

## Phase 2 — Auth: Magic Link + Members Table

Core auth infrastructure. Members can sign in via email magic link; the allowlist lives in Supabase from day one (no JSON file).

### Supabase setup
- [ ] Create a free Supabase project
- [ ] Add `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` to env (and Cloudflare Workers env vars)
- [ ] Install `@supabase/supabase-js`
- [ ] Enable "Link accounts with same email" in Supabase Auth settings (so magic link and OAuth identities for the same email become one user)

### Members table (the allowlist)
- [ ] Create `members` table — `id`, `email` (unique, lowercased), `name`, `phone`, `auth_user_id`, `is_admin`, `is_active`, `created_at`
- [ ] Seed with the current member list
- [ ] RLS: members can read their own row; admin role can read/write all

### Auth pages and middleware
- [ ] Create `src/middleware.ts` — intercept `/members/*`, check Supabase session, look up `auth.uid()` against `members.auth_user_id`, redirect to `/signin` if no match
- [ ] Create `src/pages/signin.astro` — email input form; check email exists in `members` table before calling `supabase.auth.signInWithOtp()`
- [ ] Create `src/pages/signin/callback.astro` — exchange magic link token for session cookie; on first sign-in, write `auth_user_id` back to the `members` row
- [ ] Create `src/pages/members/index.astro` — basic gated landing page
- [ ] Add Members link to nav (redirects to `/signin` when unauthenticated)
- [ ] Test: allowlisted email receives link and lands on `/members`
- [ ] Test: non-allowlisted email is rejected silently

---

## Phase 3 — Auth: OAuth (Google, Microsoft, Apple)

One-click sign-in for the ~70%+ of members with a Google, Microsoft, or Apple account. Same allowlist gate as magic link.

- [ ] Register Google OAuth app in Google Cloud Console, enable in Supabase dashboard
- [ ] Register Microsoft OAuth app in Azure AD, enable in Supabase dashboard
- [ ] Register Apple Service ID in Apple Developer portal, enable in Supabase dashboard
- [ ] Add Sign in with Google / Microsoft / Apple buttons to `signin.astro`
- [ ] On OAuth callback, check returned email against `members` table before allowing session
- [ ] Test each provider end-to-end with an allowlisted account
- [ ] Test that an unrecognised email from OAuth is rejected

---

## Phase 4 — Training Credits

Session balance tracking, top-up history, Stripe online top-up via Astro API route, and admin tools for cash payments and session deductions.

### Data model
- [ ] Create `credit_transactions` table — `id`, `member_id`, `amount_pence` (positive for credit, negative for debit), `type` (top_up | session | manual_adjustment | refund), `idempotency_key` (unique), `notes`, `created_by`, `created_at`
- [ ] RLS: members can read their own transactions; admin role can read/write all
- [ ] Create a `member_balances` view that sums `credit_transactions.amount_pence` per member

### Member-facing
- [ ] Create `src/pages/members/credits.astro` — current balance + transaction history
- [ ] Link credits page from `/members` dashboard

### Stripe top-up
- [ ] Retrieve API keys from existing club Stripe dashboard (Standard account)
- [ ] Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to env
- [ ] Create `src/pages/members/topup.astro` — amount selector (£10 / £20 / custom), creates Stripe Checkout session with `member_id` in metadata
- [ ] Create `src/pages/members/topup/success.astro` — post-payment confirmation page
- [ ] Create `src/pages/api/stripe/webhook.ts` — Astro API route, verifies Stripe signature with the service-role Supabase client, writes `top_up` transaction using the Stripe event ID as `idempotency_key`
- [ ] Register webhook endpoint in Stripe dashboard
- [ ] Test: £10 top-up via Stripe Checkout → balance updates
- [ ] Test: replay the same webhook event → no duplicate transaction (idempotency)

### Admin tools
- [ ] Create `src/pages/admin/credits.astro` — select member, record cash top-up or session deduction with a note
- [ ] Gate `/admin/*` to `members.is_admin = true` in middleware
- [ ] Test: admin records a cash payment → member balance updates

---

## Phase 5 — Training Sign-in PWA

Standalone React + Vite PWA at `signin.omaghharriers.com`. Used by club admins at training sessions to mark attendance and record cash payments. Shares the same Supabase project. Built with offline-first idempotent writes so flaky leisure-centre wifi can't double-charge anyone.

### Setup
- [ ] Create new repo (or monorepo workspace) for the PWA — Vite + React
- [ ] Configure Cloudflare Pages deployment from the new repo, point `signin.omaghharriers.com` at it
- [ ] Connect to the same Supabase project — admin role required
- [ ] Add Web App Manifest and service worker (PWA installable on iOS and Android)
- [ ] Implement offline write queue — IndexedDB store, flushed when connectivity returns

### Core features
- [ ] Admin sign-in (Supabase auth, admin role required)
- [ ] Session view — list of active members with attendance status
- [ ] Mark attendance — one tap per member, writes to `attendance` table and inserts a `session` debit to `credit_transactions`
- [ ] Record cash payment — select member, enter amount, writes `manual_adjustment` to `credit_transactions`
- [ ] Member balance visible inline so admin knows if a member is in credit or needs to pay

### Idempotency
- [ ] Use deterministic `idempotency_key` for all writes — e.g. `attendance:{member_id}:{session_date}` and `cash:{member_id}:{client_uuid}`
- [ ] Write with `ON CONFLICT (idempotency_key) DO NOTHING` so retries / offline-then-sync never double-write
- [ ] Test: queue an attendance write offline → bring app online → exactly one row appears
- [ ] Test: trigger sync twice in rapid succession → no duplicate

### Supabase additions
- [ ] Create `attendance` table — `id`, `member_id`, `session_date`, `recorded_by`, `idempotency_key` (unique), `created_at`
- [ ] RLS: admin role can insert/read all; members can read their own attendance

---

## Phase summary

| Phase | What ships | Key dependency |
|---|---|---|
| 1 | SSR foundation on Cloudflare Workers | None |
| 2 | Magic link auth + Supabase members table | Supabase project |
| 3 | Google / Microsoft / Apple OAuth | OAuth app registrations |
| 4 | Training credits, Stripe top-up, admin area | Stripe API keys |
| 5 | Training sign-in PWA | Phase 4 schema |
