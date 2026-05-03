# Members Area

## Goal

A low-friction, invite-only members area for club members. No account creation — members sign in using an email address that appears on the pre-approved allowlist. The same Supabase backend powers a separate sign-in PWA used by admins at training sessions.

## Auth Strategy

Two complementary methods, both gated by the allowlist (which lives in the Supabase `members` table). Supabase's "link accounts with same email" setting means a member who uses both methods becomes a single auth user.

### Magic link

Member enters their email → allowlist check → Supabase sends a one-click link → they're in. Covers 100% of members.

### Google + Microsoft + Apple OAuth

One-click sign-in for the majority. The OAuth provider returns a verified email; if it's on the allowlist, the session is granted. ~5-minute config per provider in the Supabase dashboard plus an OAuth app registration in each developer console.

**Coverage:** ~40% Gmail, ~25% Microsoft, plus Apple ID holders (common on iPhones) — likely 70%+ of members get one-click sign-in.

> **Decision: SMS and WhatsApp OTP are out of scope.** Magic link + OAuth covers everyone with no per-message costs, no Twilio account, and no Meta approval process. Phone OTP would add operational overhead for a UX that magic link already delivers.

## Member Allowlist

The allowlist lives in the Supabase `members` table from day one (no JSON file). The table doubles as the canonical record for credits, attendance, and admin role flags.

```
members
  id, auth_user_id, email (unique, lowercased), name, phone,
  is_admin, is_active, created_at
```

- Sign-in flow: check the submitted email against `members` before calling Supabase auth
- On first successful sign-in: write the new `auth_user_id` back to the row
- Lapsed members: flip `is_active = false`
- New members: insert a row (manual SQL or admin UI in the members area)

## Stack Changes

The site is currently **static (Astro SSG) deployed on Cloudflare Pages**. To support server-side auth middleware, switch to SSR using the Cloudflare Workers adapter:

```sh
npx astro add cloudflare
```

Then add `output: 'server'` to `astro.config.mjs`. Existing static pages continue to work unchanged; middleware only activates for `/members/*`, `/admin/*`, and `/signin/*`.

> **On Workers vs Pages:** the Cloudflare Pages path is being deprecated by Cloudflare in favour of Workers. Migrating to Workers now (rather than pinning the adapter to v12 to stay on Pages) avoids fighting end-of-life tooling later.

## Planned Routes

| Route | Access | Notes |
|---|---|---|
| `/members` | Members only | Dashboard / landing page |
| `/members/credits` | Members only | Balance + transaction history |
| `/members/topup` | Members only | Stripe Checkout entry |
| `/members/topup/success` | Members only | Post-payment confirmation |
| `/admin/credits` | Admin only | Manual credit adjustments + session recording |
| `/api/stripe/webhook` | Public (Stripe-signed) | Astro API route — credits accounts on top-up |
| `/signin` | Public | Magic link / OAuth entry point |
| `/signin/callback` | Public | Supabase auth callback handler |

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
  type (top_up | session | manual_adjustment | refund),
  idempotency_key (unique), notes, created_by, created_at
```

Balance = `SUM(amount_pence)` per member (exposed via a `member_balances` view). History is the full transaction log.

### Online top-up via Stripe

The club already has a **Stripe Standard account** connected to Klubfunder — use the same account directly. No new Stripe account needed.

Flow:
1. Member selects a top-up amount (£10 / £20 / custom) in the members area
2. App creates a Stripe Checkout session with `member_id` in metadata, redirects to Stripe's hosted page
3. On success, Stripe fires a webhook to `/api/stripe/webhook` (Astro API route, not a Supabase Edge Function — fewer moving parts, single deployment pipeline)
4. The handler verifies the Stripe signature, then writes a `top_up` transaction using the Stripe event ID as `idempotency_key` (replays are safe)
5. Member is redirected back with their updated balance

**Fees:** ~1.4% + 20p per transaction (e.g. 34p on a £10 top-up). Paid by the club, not the member.

### Cash top-up / session deduction

Admin records these in the sign-in PWA at the session, or in `/admin/credits` from the desktop members area. Both routes write to `credit_transactions` with `type = manual_adjustment` or `session`, using a deterministic `idempotency_key` so offline-then-sync from the PWA can never double-charge.

## Sign-in PWA (separate deployment)

A standalone React + Vite PWA hosted at `signin.omaghharriers.com`, used by admins at training sessions. Mobile-first, installable, offline-resilient. Members never see the URL — admins install it on their phones once.

Detailed in [members_area_implementation_plan.md](members_area_implementation_plan.md).

## Cost Summary

| Item | Annual cost |
|---|---|
| Cloudflare Workers / Pages | Free tier covers everything |
| Supabase | Free tier (500MB DB, 50k MAU) |
| Stripe | ~1.4% + 20p per top-up transaction |
| Domain | Existing |
| **Total ongoing** | **£0/year + Stripe fees** |

## Open Questions

- What content goes in the members area beyond credits? (race results, membership status, committee docs?)
- Who manages the allowlist when new members join or lapse? Admin UI in the members area, or direct Supabase SQL?
- Should lapsed members lose access immediately, or have a grace period?
