# Members Area

## Goal

A low-friction, invite-only members area for club members. No account creation — members sign in using an email address that appears on the pre-approved allowlist. The same Supabase backend powers a separate sign-in PWA used by admins at training sessions.

## Auth Strategy

Two complementary methods, both gated by the allowlist (which lives in the Supabase `members` table). Supabase's "link accounts with same email" setting means a member who uses both methods becomes a single auth user.

### Magic link

Member enters their email → Supabase sends a one-click link (only if a pre-provisioned auth user exists for that email — see [Member Allowlist](#member-allowlist)) → they're in. Covers 100% of members.

### Google + Microsoft OAuth

One-click sign-in for the majority. The OAuth provider returns a verified email; if a Supabase auth user already exists for that email (i.e. they're allowlisted — see below), the session is granted. ~5-minute config per provider in the Supabase dashboard plus an OAuth app registration in each developer console.

**Coverage:** ~40% Gmail + ~25% Microsoft → ~65%+ of members get one-click sign-in. Everyone else uses magic link.

> **Decision: SMS, WhatsApp OTP, and Sign in with Apple are out of scope.** Magic link + Google + Microsoft covers everyone with no per-message costs, no Twilio account, no Meta approval process, and no £99/year Apple Developer Program membership. Phone OTP and Apple Sign-In would add operational overhead for a UX that magic link already delivers.

## Member Allowlist

The allowlist lives in the Supabase `members` table from day one (no JSON file). The table doubles as the canonical record for credits, attendance, and role assignments.

```
members
  id, auth_user_id, email (unique, lowercased), name, phone,
  role ('member' | 'admin' | 'superuser'),
  is_active, terms_accepted_at, created_at
```

### Roles

Three levels, ordered by increasing privilege:

- **`member`** — default. Sees their own credits, transactions, attendance.
- **`admin`** — everything `member` sees, plus the admin area: manage members (add/deactivate), record cash top-ups and manual adjustments, run training sign-ins via the PWA, view reports.
- **`superuser`** — everything `admin` sees, plus role assignment (promote/demote admins) and any future destructive or audit-sensitive actions. Reserved for one or two trusted committee members.

Enforcement: a `custom_access_token_hook` injects `role` into the JWT on every token issue. RLS policies and middleware checks reference `auth.jwt() ->> 'role'`.

### How the allowlist is enforced

Rather than intercepting each sign-in attempt to check the email against `members`, we lean on Supabase's own user table:

- **"Disable new sign-ups"** is toggled on in Supabase Auth settings. Supabase will only authenticate emails that already have an auth user.
- **Pre-provision auth users** for every allowlisted member. At seed time (and whenever a new member is added) the backend calls the Supabase Admin API to create the auth user and writes the returned `auth_user_id` back into the `members` row.
- This gates **both** magic link and OAuth automatically: a non-allowlisted Google or Microsoft sign-in is rejected by Supabase before any callback runs. No per-callback allowlist logic, no auth hooks needed.

### New-member onboarding

When a new member joins:
1. Admin adds them via the member management UI (in the admin area).
2. Backend calls the Supabase Admin API to create the auth user.
3. A row is inserted into `members` with the new `auth_user_id`.
4. The member can sign in immediately via magic link or OAuth.

### Lapsed members

- Flip `is_active = false` on the `members` row, and revoke the Supabase auth user (or just delete it) so they can no longer sign in.

### UX for non-allowlisted email

If someone enters an email that isn't allowlisted, the sign-in form returns an **explicit** message ("This email isn't on our member list — please contact the committee"). For a small club where membership is semi-public anyway, the better UX wins over silent rejection.

### Initial seed

The initial members list is sourced from a **Klubfunder export** — the existing membership system. One-off CSV → Supabase Admin API ingestion at the start of Phase 2.

### Email branding

Supabase's default magic-link email is generic and shows Supabase branding. The auth email templates (magic link, OTP, etc.) are customised with Omagh Harriers branding and sender name as part of Phase 2.

### Terms & conditions and privacy

On first sign-in (and on any later T&Cs revision), members are redirected to a `/signin/terms` page and must accept before reaching `/members`. Acceptance is recorded as a timestamp on the `members` row (`terms_accepted_at`). A public `/privacy` page describes what data is held, why, and how to request deletion. Deletion requests are handled manually by an admin (rare).

## Stack Changes

The site is currently **static (Astro SSG) deployed on Cloudflare Pages**. To support server-side auth middleware, enable SSR via Pages Functions using Astro's Cloudflare adapter (`directory` mode):

```sh
npx astro add cloudflare
```

Then add `output: 'server'` to `astro.config.mjs`. Existing static pages stay statically generated by adding `export const prerender = true` to each; middleware only activates for `/members/*`, `/admin/*`, and `/signin/*`.

> **Why Pages, not Workers:** Pages Functions run on the same Workers runtime, so there's no functional difference for an Astro SSR site. Cloudflare's investment is shifting toward Workers, but Pages is not deprecated and there's nothing here that benefits from the migration cost. Stay on Pages; revisit only if Cloudflare publishes an EOL date.

### Supabase redirect URLs

In Supabase Auth settings, add `https://omaghharriers.com/**`, `https://signin.omaghharriers.com/**`, and the localhost dev URLs to the allowlist — without this, magic-link redirects are rejected.

## Planned Routes

| Route | Access | Notes |
|---|---|---|
| `/members` | Members only | Dashboard / landing page |
| `/members/credits` | Members only | Balance + transaction history |
| `/members/topup` | Members only | Stripe Checkout entry |
| `/members/topup/success` | Members only | Post-payment confirmation |
| `/admin/members` | Admin only | List, add, deactivate members |
| `/admin/members/roles` | Superuser only | Promote / demote admins |
| `/admin/credits` | Admin only | Manual credit adjustments + session recording |
| `/admin/sessions` | Admin only | Create / list training sessions |
| `/admin/reports` | Admin only | Attendance, balances, top-up summaries |
| `/api/stripe/webhook` | Public (Stripe-signed) | Astro API route — credits accounts on top-up |
| `/signin` | Public | Magic link / OAuth entry point |
| `/signin/callback` | Public | Supabase auth callback handler |
| `/signin/terms` | Authenticated, pre-acceptance | T&Cs accept page (first sign-in or after revision) |
| `/privacy` | Public | Privacy notice |
| `/terms` | Public | Terms & conditions |

## Env Vars

| Variable | Purpose |
|---|---|
| `PUBLIC_SUPABASE_URL` | Supabase client config |
| `PUBLIC_SUPABASE_ANON_KEY` | Supabase client config |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side writes from Stripe webhook (never exposed to client) |
| `STRIPE_SECRET_KEY` | Create Checkout sessions server-side |
| `STRIPE_WEBHOOK_SECRET` | Verify webhook signatures |
| `PUBLIC_STRIPE_PUBLISHABLE_KEY` | (optional) if using Stripe.js client-side |

## Training Credits

Session attendance costs £2. Members can top up their balance in advance (e.g. £10 = 5 sessions). Cash payments are recorded by an admin in the sign-in PWA at the session itself; online top-ups go through Stripe.

### Data model

```
credit_transactions
  id, member_id, amount_pence (signed),
  type ('top_up_stripe' | 'top_up_cash' | 'session' | 'manual_adjustment' | 'refund'),
  attendance_id (nullable, FK → attendance — set when type='session'),
  idempotency_key (unique), notes, created_by, created_at
```

Balance = `SUM(amount_pence)` per member (exposed via a `member_balances` view). History is the full transaction log.

### Transparency commitment

Members see their full credit history, with each row clearly labelled by method and source. The credits page renders human-readable lines such as:

- *£10.00 added — paid by card via Stripe — 2026-05-04*
- *£10.00 added — paid by cash at training, recorded by Eoin Mullan — 2026-05-06*
- *£2.00 deducted — Monday Track Speed — 2026-05-06*

Joining `credit_transactions` to `attendance` and `training_sessions` (see below) gives session debits the session name and date without storing it twice.

### Online top-up via Stripe

The club already has a **Stripe Standard account** connected to Klubfunder — use the same account directly. No new Stripe account needed.

**Top-up amounts (probable, pending stakeholder discussion):** £10, £20, £40 fixed buttons. No custom amount. Anything lower and Stripe fees become a meaningful percentage; anything higher increases refund risk if a member is injured before using the credit.

**Negative balances are allowed.** A member who attends without enough credit goes into the red — the system continues to function and the balance simply records reality. The next top-up clears the deficit.

Flow:
1. Member selects a top-up amount in the members area
2. App creates a Stripe Checkout session with `member_id` in metadata, redirects to Stripe's hosted page
3. On success, Stripe fires a webhook to `/api/stripe/webhook` (Astro API route, not a Supabase Edge Function — fewer moving parts, single deployment pipeline)
4. The handler verifies the Stripe signature, then writes a `top_up` transaction using the Stripe event ID as `idempotency_key` (replays are safe)
5. Member is redirected back with their updated balance

**Fees:** ~1.4% + 20p per transaction (e.g. 34p on a £10 top-up). Paid by the club, not the member.

### Cash top-up / session deduction

Admin records these in the sign-in PWA at the session, or in `/admin/credits` from the desktop members area. Both routes write to `credit_transactions` with `type = manual_adjustment` or `session`, using a deterministic `idempotency_key` so offline-then-sync from the PWA can never double-charge.

## Training Sessions & Attendance

Training sessions are first-class entities, not free-text dates. The club may run several different sessions on the same day (e.g. three on a Monday) and we want to know who attended which one.

```
training_sessions
  id, name, starts_at (timestamptz), location (nullable),
  created_by, created_at

attendance
  id, member_id, session_id (FK → training_sessions),
  recorded_by, idempotency_key (unique), created_at
```

- Sessions are created by admins (or superusers) — either ahead of time from the admin area, or on the spot in the sign-in PWA before sign-ins begin.
- The PWA presents a session selector after admin sign-in; all attendance writes within that session belong to its `session_id`.
- Idempotency key for an attendance row is deterministic: `attendance:{member_id}:{session_id}` — sign-in is naturally one-per-member-per-session.
- When attendance is recorded, a paired `credit_transactions` row of `type = 'session'` with `attendance_id` set is inserted in the same transaction. This anchors the audit trail and powers the transparency view.

Attendance is a permanent record independent of payment status — keeping the attendance log is as important as keeping the credit log.

## Admin Reporting

A dedicated reporting area inside `/admin` for committee operational needs. No new tables — these are queries and views over `members`, `credit_transactions`, `training_sessions`, and `attendance`. Likely reports:

- Attendance by session (who turned up to Monday Track Speed on a given date)
- Attendance by member over a date range
- Member balances (current snapshot, plus members in arrears)
- Cash vs Stripe top-up totals over a period
- Session frequency and headcounts over time

Exportable as CSV. Read-only — no destructive actions on this page.

## Sign-in PWA (separate deployment)

A standalone React + Vite PWA hosted at `signin.omaghharriers.com`, used by admins at training sessions. Mobile-first, installable, offline-resilient. Members never see the URL — admins install it on their phones once.

Detailed in [members_area_implementation_plan.md](members_area_implementation_plan.md).

## Cost Summary

| Item | Annual cost |
|---|---|
| Cloudflare Pages | Free tier covers everything |
| Supabase | Free tier (500MB DB, 50k MAU) |
| Stripe | ~1.4% + 20p per top-up transaction |
| Domain | Existing |
| **Total ongoing** | **£0/year + Stripe fees** |

## Open Questions

- What content goes in the members area beyond credits? (race results, membership status, committee docs?)
- Final top-up amounts (currently £10 / £20 / £40 — pending stakeholder discussion).
