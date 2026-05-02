# Members Area

## Goal

A low-friction, invite-only members area for club members. No account creation — members sign in using their existing email address. Identity is verified against a pre-approved allowlist of known member emails.

## Auth Strategy

**Magic link (passwordless email)** is the primary auth method — works for all email providers. Optionally add Google and Microsoft OAuth as a convenience shortcut for the majority of members.

Flow:
1. Member enters email on the sign-in page
2. Middleware checks the email against the allowlist — if not found, reject before sending anything
3. Supabase sends a magic link to their inbox
4. One click and they're in, session lasts 30 days
5. Optional: "Sign in with Google" / "Sign in with Microsoft" buttons skip step 1–3 for those providers

Auth provider: **Supabase Auth** (free tier, magic links + OAuth built-in, works with Astro SSR).

## Member Allowlist

The allowlist is the source of truth for who is a member. Start with a static approach, migrate to the database once there's a reason to (e.g. self-service renewal).

- Store unique, lowercase member emails in `src/data/members.json`
- Deduplicate and normalise on import (lowercase, trim)
- On each sign-in attempt, check the email against this list before calling Supabase
- Supabase row-level security can also enforce this at the DB layer as a belt-and-braces measure

## Stack Changes

The site currently uses Astro with static output. To support server-side auth middleware, one change is needed:

**`astro.config.mjs`** — add `output: 'server'` and a server adapter (e.g. Vercel or Node).

Everything else stays the same — existing static pages continue to work, the middleware only activates for `/members/*` routes.

## Planned Routes

| Route | Access | Notes |
|---|---|---|
| `/members` | Members only | Dashboard / landing page |
| `/members/profile` | Members only | View membership details |
| `/signin` | Public | Magic link / OAuth entry point |
| `/signin/callback` | Public | Supabase auth callback handler |

## Rough Implementation Steps

1. **Switch to SSR** — add `output: 'server'` and a server adapter to `astro.config.mjs`
2. **Add Supabase** — install `@supabase/supabase-js`, create a free Supabase project, configure env vars (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`)
3. **Build the allowlist** — create `src/data/members.json` from the current member email list (deduplicated, lowercased)
4. **Auth middleware** — `src/middleware.ts` intercepts requests to `/members/*`, checks for a valid Supabase session, redirects to `/signin` if not authenticated
5. **Sign-in page** — `src/pages/signin.astro` with an email input form; on submit, check allowlist then call `supabase.auth.signInWithOtp()`
6. **Auth callback** — `src/pages/signin/callback.astro` exchanges the token from the magic link for a session cookie
7. **Members pages** — `src/pages/members/index.astro` etc., gated by middleware
8. **OAuth (optional, post-MVP)** — add Google and Microsoft as providers in Supabase dashboard, add buttons to the sign-in page

## Open Questions

- What content goes in the members area? (race results, membership status, renewal, committee docs?)
- Who manages the allowlist when new members join / lapse? Manual JSON edit, or a simple admin UI?
- Hosting: currently static — what adapter to use for SSR? (Vercel is the simplest if already deployed there)
- Should lapsed members lose access? If so, the allowlist needs an active/inactive flag
