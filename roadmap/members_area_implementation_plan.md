# Members Area — Implementation Plan

Phases are intended to be shipped independently. Each phase is self-contained and leaves the site in a working state.

## Deployment Architecture

| App | Subdomain | Hosting | Backend |
|---|---|---|---|
| Public site + members area | `omaghharriers.com` | Cloudflare Pages (SSR via Pages Functions) | Supabase |
| Training sign-in PWA | `omaghharriers.com/registrar` | Same Cloudflare Pages project, prerendered route | Same Supabase project, same cookie session |

**Admin area** (`/admin/*`) lives inside the club site as SSR Astro pages — desktop management tasks (member list, credit adjustments, history). Gated by an admin role check in middleware.

**Training sign-in PWA** is a prerendered route on the main site with a React island — mobile-first, installable, used at sessions to mark attendance and record cash payments. Reached from a card in the members' area that only a registrar sees, so it installs already signed in. See *One origin, one sign-in* in Phase 5.

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
│   └── (no second app — the registrar PWA is /registrar on the site)
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
| Stripe top-up fees | ~1.4% + 20p per transaction (e.g. 34p on a £10 top-up — paid by club, not member). Not being incurred: card payment is parked, see Phase 4 |
| **Total ongoing** | **~£0/year** |

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

One-click sign-in for the ~65%+ of members with a Google or Microsoft account.

Sign-ups are disabled (Phase 2), so Supabase refuses any OAuth sign-in for an email with no pre-provisioned auth user. That gating is free, but on its own it only produces a bare redirect, so the callback turns the refusal into a message the member can act on. The sign-in page also checks the membership email up front, which means an unregistered address is now turned away before a provider is ever involved.

- [x] Register Google OAuth app in Google Cloud Console, enable in Supabase dashboard, register the Supabase OAuth callback URL
- [x] Register Microsoft OAuth app in Azure AD (personal accounts tenant for consumer use), enable in Supabase dashboard, register the Supabase OAuth callback URL
- [x] Add Sign in with Google / Microsoft buttons to `signin.astro`
- [x] Ask for the membership email first and offer only the provider that fits it
- [x] Test each provider end-to-end with an allowlisted account
- [x] Test that an unrecognised email is rejected — now caught before the provider is reached, since the flow checks the membership email first

### Email aliases

A provider signs a member in under its account's **primary** address, not whichever
alias they typed. A member whose Klubfunder email is a secondary alias on their
Microsoft account will come back as a different address entirely.

Because the flow asks for the membership email up front, `/signin/callback` holds
that address in a short-lived cookie and turns away any sign-in that returns a
different one. The member is told to use an email link instead. Without that check
the mismatch is silent: Supabase links the identity to whatever auth user owns the
primary address, so the member lands in someone else's household — or their own
second principal, which is how this was found.

---

## Phase 4 — Training Credits

Session balance tracking, top-up history, and admin tools for cash payments and session deductions. Balances are held **per principal** (the household), not per member — one parent tops up once and any of their members can draw from it. An admin credit-transfer feature also belongs here, used to move a stranded balance when a household's contact email changes in Klubfunder.

**The club starts out on cash in, sessions out.** The committee decided on 17 Nov 2026 not to take card payments yet, so the Stripe section below is parked rather than pending — see it for what is already in place for when that changes.

### Data model
- [x] Create `credit_transactions` table — `id`, `principal_id`, `amount_pence` (positive for credit, negative for debit), `type` (`'top_up_stripe' | 'top_up_cash' | 'session' | 'manual_adjustment' | 'refund' | 'transfer_in' | 'transfer_out'`), `member_id` (nullable, set when the transaction is tied to a specific member — typically `'session'`), `idempotency_key` (unique), `notes`, `created_by`, `created_at`. A CHECK ties the sign of the amount to the type, and a trigger makes the table append-only — a mistake is corrected with a compensating row, not an edit. An `attendance_id` was pencilled in for Phase 5; Phase 5 decided against it, for the reason recorded there
- [x] RLS: principals can read transactions for their own household; admin/superuser role can read/write all
- [x] Create a `principal_balances` view that sums `credit_transactions.amount_pence` per principal

### Member-facing (transparency)
- [x] Create `src/pages/members/credits.astro` — current balance + full transaction history with each row clearly labelled by method (Stripe vs cash). Session debits name the member; the session name and date follow in Phase 5, when `training_sessions` exists
- [x] Use human-readable line formats, e.g. *"£10.00 added — paid by card via Stripe"*, *"£10.00 added — paid by cash at training, recorded by Eoin Mullan"*, *"£2.00 deducted — Monday Track Speed"* (`src/lib/credits/transactions.ts`)
- [x] Link credits page from `/members` dashboard — the dashboard shows the balance itself

### Stripe top-up — parked (committee decision, 17 Nov 2026)

Not being built. Cash is recorded by an admin instead. Nothing in the shipped code
promises card payment: there is no top-up button and no dead route. What is already
in place for the day it is wanted — the `top_up_stripe` transaction type, its CHECK
constraint, and the *"paid by card via Stripe"* line format with its test — costs
nothing to leave standing.

The boxes below are kept as the plan, not as outstanding work.

- [ ] Retrieve API keys from existing club Stripe dashboard (Standard account)
- [ ] Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to env
- [ ] Create `src/pages/members/topup.astro` — fixed amount buttons (£10 / £20 / £40, pending final stakeholder confirmation), creates Stripe Checkout session with `principal_id` in metadata
- [ ] Create `src/pages/members/topup/success.astro` — post-payment confirmation page
- [ ] Create `src/pages/api/stripe/webhook.ts` — Astro API route, verifies Stripe signature with the service-role Supabase client, writes `top_up_stripe` transaction using the Stripe event ID as `idempotency_key`
- [ ] Register webhook endpoint in Stripe dashboard
- [ ] Test: £10 top-up via Stripe Checkout → balance updates
- [ ] Test: replay the same webhook event → no duplicate transaction (idempotency)

### Admin tools
- [x] Create `src/pages/admin/credits.astro` — club float plus every household's balance, filterable, each linking to `/admin/credits/[id]` where the cash payment or adjustment is recorded. Two pages rather than one, mirroring `/admin/principals`: the household you are recording against is the household you are looking at
- [x] **Credit transfer** — the source is the household you are on; pick the target, optionally an amount (defaults to the full source balance), required note. Writes paired `transfer_out` (negative) and `transfer_in` (positive) rows naming each other in `notes`, as **one multi-row insert** so neither side can land alone — the ledger is append-only, so a stranded half could not be taken back. Used when a household's contact email changes in Klubfunder and the balance needs to follow them.
- [x] Gate `/admin/*` to `role IN ('admin', 'superuser')` in middleware — landed in Phase 2
- [x] Test: admin records a cash payment → principal balance updates and the transaction is labelled "paid by cash" on the credits page
- [x] Test: admin charges a training session → balance falls and the member's own page reads "training session for ..."
- [x] Test: the append-only trigger refuses a DELETE — proven by having to disable it to clean up the test rows, which is the only way to exercise it without leaving a row behind forever
- [x] Test: admin transfers a balance from principal A to principal B → both balances update, both transactions appear in each principal's history
- [x] **Record a session debit** — with card payment parked, this is how credit leaves an account until the Phase 5 PWA exists. Writes a `session` row against a household, optionally naming the member, so it reads as *"£2.00 deducted — training session for ..."* rather than as an unexplained adjustment. Charge defaults to the £2 constant; the member is resolved from the household's own members, so a crafted post cannot charge one household's session to another's child

---

## Phase 5 — Training Sessions, Attendance & Sign-in PWA

Introduces training sessions as first-class entities, attendance recording against them, and the installable sign-in app at `omaghharriers.com/registrar`. Used by club registrars at training to mark attendance and record cash payments. Shares the same Supabase project. Built with offline-first idempotent writes so flaky leisure-centre wifi can't double-charge anyone.

**Usability comes before every other consideration in this phase.** The registrar is
standing at the track with a queue of runners in front of them, often in the cold and
the dark, frequently holding something else. Every design argument is settled by asking
which option costs that person fewer seconds and less thought. A feature that is correct
but fiddly is the wrong feature here.

The club currently uses Spond, whose mobile experience is generally well liked. Spond is
the bar: anything slower or more confusing than it is a regression the club will rightly
refuse. Where the chance exists to beat it — fewer taps to sign someone in, a balance
visible without drilling in, a mis-tap that can be undone on the spot — take it.

This ships as a **trial replacement** for Spond, for the committee to judge. The thing
being tested is credit: a runner holding £10 rather than finding £2 every week. Spond's
other features — availability, RSVPs, messaging — are not fully used by the club and are
not in scope.

### Decisions taken

- **A runner with no credit is signed in anyway**, and the balance goes negative. The registrar never adjudicates at the track
- **Guests pay at the time and hold no credit.** A non-member is a name and an attendance row — no principal, no auth user, no balance that could go negative
- **Session price is a constant in code, £2.** It has been £2 for years; a one-line edit and a deploy beats a settings table nobody opens
- **Sessions are not generated from the published schedule.** Publishing the timetable and running training are two different jobs done by two different people in the club, and the plan deliberately keeps them apart
- **The attendance screen is a list**, decided by prototype on 17 Nov 2026. Three screens were built and clicked through on `prototype/registrar-screen`: a list, a one-runner-at-a-time search, and a board that moved names out of "expected" and into "here". The list won. The other two both put a runner's state somewhere other than the row the registrar is looking at, and the board moved names under the thumb as it emptied, which produced a mis-tap within a minute of use
- **Nothing on the screen has an undo button.** Every control shows its own state and is reversed by using it again — a ticked box unticks, a recorded payment can be taken back from the cell that shows it. See *Registrar experience* below
- **The registrar role reads the whole club and writes only the night.** It can see every
  principal, member and ledger row, because a household balance beside a name is the sum of
  that ledger and the app holds no service-role key. It can add sessions, attendance, guests
  and cash, and change nothing else: not a name, not a role, not a session's price once set.
  Proved against a throwaway Postgres rather than asserted — a registrar's attempts to edit a
  member, promote themselves, retitle a group or re-price a session all come back having
  touched no rows
- **A tick is held for a moment before it is written, by coalescing the queue's
  flush rather than by a cool-off timer.** A visible delay was considered and
  refused: for as long as the screen says ticked and the server does not know, a
  second phone on the same session shows that runner as absent and signs them in
  too — and the unique index on `(member_id, session_id)`, which is the only thing
  stopping the duplicate, cannot fire until a write lands. A deliberate delay
  widens the window it means to protect, and a backgrounded phone suspends the
  timer anyway. Coalescing the flush over a short window instead — well under a
  second, not five — costs nothing, falls out of the offline queue that exists
  regardless, and makes a tick followed immediately by an untick cancel inside the
  queue so that neither the debit nor its reversal is ever written. Which is also
  the cheapest answer to the question below
- **Weekly summary emails are parked**, possibly for later. They would need an email provider the club does not pay for, as Cloudflare Email Routing is inbound-only

### Supabase additions
- [x] Create `groups` table — `id`, `name`, `is_active`, `created_at`. The squads the club actually trains in — sprints, middle distance, endurance, seniors, juniors, and whatever is added next. Admins add them through the UI, so the list is never a deploy away
- [x] Create `training_sessions` table — `id`, `name`, `group_id` (FK → `groups`), `starts_at` (timestamptz), `location` (nullable), `price_pence` (NOT NULL), `is_cancelled`, `created_by`, `created_at`
- [x] `price_pence` is set from a **£2** constant in code at creation time. The session keeps its own copy, so changing the constant never rewrites a session that has already run, and never touches the ledger, which records what was actually charged
- [ ] **Migration needed:** relax `training_sessions.price_pence` from `CHECK (price_pence > 0)` to `>= 0`, so a free session can exist. `0009` forbade zero on the grounds that it would produce no ledger row; that is now the wanted behaviour — see *A session that costs nothing* below. Not yet written
- [x] Create `member_groups` — `member_id`, `group_id`. Which squads a member trains with. This is what makes the Usuals list useful on day one, before any attendance history exists
- [x] Create `guests` table — `id`, `first_name`, `surname`, `created_at`, `created_by`. A returning guest is picked from this list rather than retyped, which also stops one person becoming three through spelling
- [x] Create `attendance` table — `id`, `session_id` (FK → `training_sessions`), `member_id` (nullable), `guest_id` (nullable), `amount_paid_pence` (nullable, guests only — they pay instead of drawing on credit), `recorded_by`, `idempotency_key` (unique), `created_at`, with a CHECK that exactly one of `member_id` and `guest_id` is set
- [x] Add `session_id` (nullable FK) to `credit_transactions` — a cash top-up taken at the track belongs to that session. Without it, "cash taken tonight" cannot be computed and the tin cannot be checked against anything
- [ ] **The registrar app always sets it; the admin site never does.** The app cannot show a list of names without a session being chosen first, so the link is free — there is no screen where a registrar could record a top-up and leave it unattached. A top-up away from the track is the admin site's job, where `session_id` stays null. Both are supported, and which one happened is then a fact rather than a guess
- [ ] Session-linked top-ups read as *"£10.00 added — paid by cash at Middle Distance Group, recorded by Eoin Mullan"* in `credits/transactions.ts`. The session name only: `/members/credits` already prints the date on its own line beneath each entry, so repeating it would read as a stutter. An unlinked top-up keeps today's wording, *"paid by cash at training"*
- [x] **No `attendance_id` on `credit_transactions`** — the plan asked for one and the schema deliberately does without it. See *Unticking a sign-in* below
- [x] RLS: `registrar`, `admin` and `superuser` can insert and read all attendance, sessions, groups and guests; members can read their own attendance and any session they attended. Guests have no login and so no read path of their own
- [x] Members can be on multiple sessions on the same day — uniqueness is `(member_id, session_id)`, not `(member_id, date)`. Guests get the same treatment on `(guest_id, session_id)`

#### Two groups nobody can tell apart

The unique index is on `lower(name)`, so Postgres would happily hold both
"Middle Distance" and "Middle-Distance". The admin screen refuses the second
anyway, on the same flattening the name search uses — case, whitespace,
apostrophes, hyphens and accents all folded away.

Being stricter than the database is the point. A registrar picking a group from
a list cannot tell those two apart, and a session created against the wrong one
takes its attendance and its charges with it. The admin gets a sentence naming
the group already using the name, which is also what the clash with a *retired*
group says — bring that one back rather than standing a second one beside it.

#### Unticking a sign-in

Both of these were settled by running the migrations against a throwaway Postgres and trying
to untick somebody, which is the only reason they were caught before the first night.

- **`credit_transactions` carries no `attendance_id`.** A foreign key to `attendance` is the
  tidier way to join a debit back to the sign-in that caused it, but it is also a RESTRICT
  reference pinning that attendance row in place — and unticking a member has to remove it.
  `ON DELETE SET NULL` is no way out either: the nulling is an UPDATE, which the append-only
  trigger refuses by name. The column was convenience and the untick is the feature, so the
  column went
- **The join goes the other way, through `(member_id, session_id)`**, which `attendance`
  already indexes uniquely and `credit_transactions` is now indexed for. Nothing is lost
  except the foreign key's own guarantee
- **A session debit is keyed `session:{attendance_id}`**, not
  `session:{member_id}:{session_id}`. The deterministic pairing cannot tell a re-tick from a
  retry: tick, untick, re-tick presents the same key a third time, `ON CONFLICT DO NOTHING`
  swallows it, and the runner finishes the night marked present and never charged. Naming the
  attendance row instead — the id minted on the phone, so it survives a retry — stays
  idempotent while telling two ticks apart
- **What stops two phones double-signing somebody is the unique index on
  `(member_id, session_id)`**, not the ledger key, so moving the key costs nothing
- **Guests were never affected.** No ledger row references a guest's attendance, so unticking
  one removes the row and the cash with it, exactly as the registrar screen promises

#### What gives the £2 back

Unticking a member deletes the attendance row, which frees its
`attendance:{member_id}:{session_id}` key so a re-tick works. The debit cannot be
deleted, and a re-tick is deliberately a *new* charge, so without something going
back the household pays twice for one session.

**It is a `manual_adjustment` at `+price_pence`, and the note does the
explaining.** No migration, it is already the one type free to go either way, and
it is already invisible to the cash total — which is the requirement that decides
this.

**It cannot be a `refund`.** The word is ordinary English for giving money back,
but in this schema `refund` means cash leaving the tin — it reverses a
`top_up_cash`, and the sign CHECK pins it negative. tick, untick, tick would come
to **−£6**, not −£2.

**Nor a `top_up_cash`.** A session's *Money collected* is the sum of
`top_up_cash` and `refund` rows carrying that `session_id`
(`training/session-cash.ts`). Either of them would move the one number the
registrar checks the tin against, and unticking moves credit, not money.

`describeEntry` already renders an adjustment as its own note, so the line reads
*"£2.00 added — Monday Track sign-in corrected for Jack, recorded by Eoin
Mullan"* with no new case in `credits/transactions.ts`. That is the whole reason
the note is written for the member rather than for the admin: it has to be a
sentence a parent can check against their own memory of the evening, which a bare
"adjustment" is not. Name the session and the runner in it.

Set `member_id` on the reversal as well, even though `describeEntry` ignores it
for an adjustment — the row should know who it was about, whatever today's
wording reads from.

It is keyed `untick:{attendance_id}`, off the attendance row it reverses, so a
double-tapped untick credits once. A re-tick mints a fresh `attendance_id`, so
unticking *that* is a different key and correctly credits again.

#### A session that costs nothing

Some sessions are free — a taster night, a club championship, a junior session
the club decides not to charge for. **A free session records attendance and
writes no ledger row at all.**

That is not a preference, it is the only thing the schema permits.
`credit_transactions.amount_pence` is `CHECK (amount_pence <> 0)`, so a £0 debit
cannot be written whatever we decide. The same holds for the reversal in *What
gives the £2 back*: there is nothing to give back, and a `manual_adjustment` of
0 would be refused too.

A guest at a free session is an attendance row with `amount_paid_pence` **NULL,
not 0** — the column is nullable but carries `CHECK (amount_paid_pence > 0)`, so
a zero would be refused where an absent figure is fine. "They paid nothing" and
"we are not recording what they paid" are the same fact here.

**This needs a migration, and it reverses a decision Phase 5 took on purpose.**
`training_sessions.price_pence` is `CHECK (price_pence > 0)`, and `0009`'s own
comment gives the reason: *"a zero-price session could produce no ledger row at
all, since credit_transactions refuses a zero amount."* That was treated as the
thing to prevent; we now want it as the behaviour. So the constraint relaxes to
`>= 0` and the comment is rewritten to say that a free session is attendance
only. Nothing else in the schema needs to move. **No migration has been written
— it is the one thing this work is not allowed to add unasked.**

Two things not to do when it lands:

- **Don't loosen `parsePounds`.** It refuses 0 deliberately, and it is shared
  with the credits screens, where a £0 top-up is meaningless and the ledger
  refuses it anyway. A free session is chosen with a **"Free session" control**,
  not by typing `0` — the same reasoning that made direction a control rather
  than a typed minus sign
- **Don't let the sign-in RPC insert the pair unconditionally.** It has to branch
  on the session price: at £0 it writes the attendance row and stops. A blind
  two-row insert fails the sign CHECK and takes the whole tick down, in front of
  a queue

`training/session-cash.ts` needs no change. A free session's figures come out as
£0 collected and no guest payments, which is the truth about the night.

### Admin: session management (in the main site)
- [x] Create `src/pages/admin/sessions.astro` — list upcoming and past sessions, create a new session (name, group, starts_at, location, price defaulted to £2). The start time is read as Omagh's clock rather than the Worker's UTC, so a summer session is not an hour out — `training/club-time.ts`
- [x] Manage groups from the same area — add one, rename one, retire one. A retired group keeps its history. `/admin/groups`, with the near-duplicate check deliberately stricter than the `lower(name)` index — see *Two groups nobody can tell apart* below
- [x] Assign members to groups, so a new session's Usuals list is populated before anyone has attended anything. `/admin/groups/[id]`, with the forgiving type-to-filter the registrar screen settled on, shared from `training/names.ts`
- [x] Allow editing name/location/price; cancellation is a soft-disable, not a row drop, so attendance history stays intact. A session that has attendance against it keeps its price — editing it would contradict the ledger. The price field disables itself once somebody has signed in, and says why
- [x] Past sessions are a first-class view, not a by-product: headcount, cash taken, and who recorded each entry. The per-registrar split only appears when more than one person recorded something, because that is the only time it is a question
- [x] Add a `registrar` role — today the only role that can write is `admin`, which can also reassign roles, deactivate households and move balances. A volunteer signing runners in on a borrowed phone needs none of that. Granted from `/admin/principals/[id]`, which was already the superuser-only place roles are set

### PWA setup
- [x] ~~Add `apps/signin` package — Vite + React~~ — **dropped.** It is `apps/site/src/pages/registrar/` with a React island in `components/registrar/`, which is what makes a single sign-in possible at all
- [x] ~~Share Supabase types via a `packages/supabase` workspace package~~ — **dropped with the second app.** One app, one copy; `src/lib/supabase/types.ts` stays where it is
- [x] ~~Configure Cloudflare Pages deployment from `apps/signin`, point `signin.omaghharriers.com` at it~~ — **dropped.** One origin, one deployment, one set of env vars, no second redirect allow-list and no DNS record
- [x] Connect to the same Supabase project — the site's own cookie session, through the existing `createSupabaseBrowserClient`, with the role read from the **`app_role`** claim on the token so the app knows what to draw with no signal. RLS gates every write — `lib/training/registrar.ts`
- [x] Web App Manifest, icons and the standalone metadata, served only on `/registrar` so Add to Home Screen anywhere else bookmarks an ordinary page. Scope `/registrar` keeps the installed window out of the rest of the site
- [ ] Service worker — deliberately not yet. It belongs with the offline queue below, and a cache added before there is anything worth caching offline only makes a stale app harder to debug. **Scope it to `/registrar`**: a root-scoped worker would start serving stale marketing pages, which is the one genuine hazard of sharing an origin
- [ ] Implement offline write queue — IndexedDB store, flushed when connectivity returns

#### One origin, one sign-in

The plan assumed a separate Vite app on `signin.omaghharriers.com` from Phase 0
onwards and never gave a reason. Examined, it does not survive.

**The registrar is already a member with an account.** Asking a volunteer to sign
in a second time, to a second thing, is the kind of friction that ends with
somebody doing attendance on paper.

**On iOS it was the wrong trade twice over.** A home screen web app gets its own
cookie container, so signing in to Safari does not sign you in to the app — but
since iOS 17.2 the cookies Safari holds are copied in **once, when the icon is
created**. `localStorage` never is. The separate app persisted its session to
local storage, which is precisely the storage iOS leaves behind; the site's
cookie session is precisely the one it carries over. Single-origin is not merely
more convenient, it is the only one of the two that installs already signed in.

The flow then needs no instructions. The members' area shows a **Sign runners
in** card to registrars, admins and superusers only. You cannot reach the app
without signing in, and by the time you can add it to your home screen the cookie
is there to be copied.

**The route is prerendered, not server-rendered**, and that is the part worth
defending. A server round trip is a blank screen at a track with no signal, and a
service worker caching a server-rendered page would be caching one registrar's
HTML to hand to the next. A static shell has neither failure, and the data comes
from the browser's Supabase client under RLS.

That means **nothing gates `/registrar`, and nothing can** — middleware does not
run for a static asset. Correct rather than a gap: the shell is empty, RLS gates
every read and write, and the role on the token decides only what is drawn.
A middleware rule would buy nothing and would break opening the app offline.

What was given up: the public site and the registrar app now deploy together, so
a registrar fix redeploys the website and a bad content deploy takes the app down
mid-session. For a club this size that beats a permanent second deployment,
second domain, second env convention and second sign-in — but it is a real cost,
not a free win.

Two things the platform forces into the UI:

- **A sign-in link cannot re-authenticate an installed iOS app.** Tapped in Mail
  it opens Safari, a different cookie container, so the app stays signed out. The
  recovery is to delete the icon and add it again, which copies a fresh cookie.
  Unlikely in practice — registrars open it weekly — but nobody guesses it
  unaided at seven on a wet Monday, so the signed-out screen says so, on iOS only
- **Safari has no install prompt.** Chrome gets the real one through
  `beforeinstallprompt`; iOS gets a dismissable line saying where Add to Home
  Screen lives

`@astrojs/react` is pinned to the **4.4.x** line. 6.x depends on Vite 8 and pulls
rolldown in alongside Astro 5's Vite 6 — it builds, then breaks the dev server
with `Missing field moduleType`.

### Member-facing

- [ ] Training history in the members' area — which sessions each member of the household attended and when. The original goal for this area was a member checking their credit *and* when they trained; Phase 4 shipped the credit half, and the RLS planned above already allows the other, but no page was ever listed for it

### The Usuals — who the registrar actually sees

300 members are in the database and 10 to 20 turn up to any given session. Juniors are
never at a senior session, sprinters never at an endurance one. The group on the session
is what makes that knowable, which is the real reason groups are worth having — the
reporting value is a bonus.

They are **the Usuals** on screen and in the code. "Shortlist" named the mechanism;
"Usuals" is what the people running the session already call them.

- [ ] Default view is the Usuals for this session's group
- [ ] **Attendance frequency decides who is on the list. Surname decides the order it is read in.** The plan previously asked for both as the ordering, which cannot hold at once. Frequency is a filter, not a sort: ordering by it would scatter siblings, and finding a name is the job the registrar actually has
- [ ] Seed the Usuals from `member_groups`, then let attendance history refine who makes the cut. History alone starts empty, which on the first night would be worse than no feature at all
- [ ] The registrar can add somebody to the list or drop them from it by hand. The system suggests; the person holding the phone decides
- [ ] Second toggle: the full member list. Third toggle: guests seen before, so a returning non-member is a tap rather than a retype
- [ ] **Order everyone by surname, everywhere.** Siblings arrive together, so the next two people the registrar needs are adjacent
- [ ] **Both figures in the header are filters.** Tapping the headcount shows who is here; tapping **Money collected** shows who has handed something over. A number and the names behind it are one control, so when the tin does not match there is nothing to go hunting for. One filter at a time — tapping either clears the other — and both answer for the whole night, not just the list that happens to be open, or the number would be describing people the registrar cannot see
- [ ] The here filter is taken from the rejected board prototype, where watching the night fill up was the one thing it did better than a list
- [ ] **One way into the full list: type part of a name.** An A–Z index was built and abandoned. With 313 members, M still returns more people than anyone can read standing at a track — a letter narrows the problem rather than solving it, and it costs a row of screen whether or not it is used. The full list simply stays on screen and shrinks as characters arrive
- [ ] **Matching is forgiving on both sides.** Lower-case and strip whitespace, apostrophes and hyphens from the stored name *and* from what is typed, so "O'Kane", "O Kane" and "okane" are one name. Klubfunder names are keyed in by hand and so is the search term at the track; neither should have to guess how the other was spelled
- [ ] Match anywhere in either name, not only the start. A registrar who knows somebody as Kane should not have to remember the O, and by three characters the list is short regardless

### Registrar experience

- [ ] **No undo button — every control carries its own state.** The ledger is append-only and a pressured registrar will mis-tap, so the recovery has to be as obvious as the mistake. A floating undo is a second affordance with its own timeout, pointing at an action that has already scrolled away. Instead the control that did the thing is the thing that shows it, and using it again reverses it
- [ ] **Attendance is a checkbox.** Ticked means here, and £2 charged. Unticked means not signed in yet. Current state is on the row being looked at, nowhere else, and correcting a mis-tap is the same gesture again
- [ ] **Cash works the same way, which is harder, because an amount is not a yes or no.** The cash cell on a row is both control and display: it reads `+ £` when nothing has been taken from that runner tonight, and the amount itself once something has. Tapping an empty cell offers the amounts; tapping a filled one offers to change it or take it back. There is no state the registrar has to carry in their head
- [ ] Quick amounts cover the common cases, but **an arbitrary amount must be enterable**. Digits shift in from the right, cash-machine style, so there is no decimal point to place in the cold and the dark
- [ ] The row shows **one figure per runner — what they have handed over tonight.** Changing £10 to £15, or taking it back entirely, writes the compensating `refund` described below. The screen shows where it landed; the ledger keeps every step that got there
- [ ] **Cash is a household fact, like the balance it feeds.** £10 handed over for one of three siblings reads the same on all three rows, because it is the same £10 going into the same pot. Tapping any sibling's cash cell edits the one figure, and the sheet names the household and its members rather than the row that was tapped
- [ ] This means a `top_up_cash` row taken at the track leaves `member_id` null, which is what Phase 4 already does — the money belongs to the principal, and `created_by` plus `session_id` say who took it and where. Only `session` debits name a member
- [ ] **Household balance, not member balance.** Credit belongs to the household, so signing in the second of three siblings must show the pot draining, not three copies of the same number
- [ ] **One line under a name, and it only ever says one thing:** what that household's pot holds right now, attributed to the principal — *"£8.00 · Ashby"*. It never narrates the night. The tick takes £2 off it and the cash cell puts money on, so both controls are legible there without the wording ever changing. Colour carries the warning — neutral in credit, amber below the price of a session, red overdrawn — because a line whose words change with the number is a line the registrar has to read rather than glance at
- [ ] **Guests.** Record a name, mark them in, take the money at the time. No account, no credit, no balance that can go negative
- [ ] **A guest's row carries no money control.** Ticking them in takes the session price in cash and that is the whole transaction — there is nothing to add funds to, because they hold no credit to add them to. The figure beside the name states what they paid and cannot be edited; a wrong tick is cleared by unticking, which takes the attendance row and the cash with it
- [ ] **Cash reconciliation, informational only.** A running total of what has been taken tonight, there to be glanced at so the tin can be checked against it. No confirmation step and nothing to tap — the registrar is told, not asked to sign for it
- [ ] Cash for a session is `top_up_cash` plus `refund` from `credit_transactions` carrying that `session_id`, plus `amount_paid_pence` on the session's guest attendance rows. Session debits are excluded — they move credit, not money. Grouping by `created_by` gives the same figure per registrar, which is the one that matters when two phones are open
- [ ] **Taking a cash payment back writes a `refund`, not a negative top-up.** The sign CHECK forbids a negative `top_up_cash`, and a `manual_adjustment` would be both unattached to the session and misleading on the member's page. `refund` is already constrained negative and already means money going back out, so the running total nets out on its own
- [ ] Unticking a guest deletes the attendance row. Guests have no ledger to compensate against, and attendance is not append-only — only `credit_transactions` is
- [ ] `describeEntry` should surface a refund's note the way it does for an adjustment. *"£10.00 deducted — refunded"* does not say why, and a keying slip corrected in front of the member deserves a reason
- [ ] The total is only complete once every device has synced. A registrar working offline sees what their own phone has taken, not the session's — say so on screen rather than showing a confident wrong number. The figure is labelled **Money collected**, so that caveat has to appear under it when it applies rather than hiding in the label, which is the right trade: the common case reads plainly and the exception announces itself
- [ ] **Two registrars at once.** A busy track will have more than one phone open on the same session. Idempotency keys stop a double charge; the view should also not fight itself when somebody else's sign-in arrives
- [ ] **Built for the conditions.** Large targets, high contrast, legible under floodlights and in rain, usable one-handed and with cold fingers. No small text, no long presses, no precision gestures
- [ ] Paper fallback — a printable session list, for the night a phone dies

### PWA core features
- [x] Registrar sign-in — there is no sign-in form. The session is the members' area's own cookie session, which is the whole point of *One origin, one sign-in*. A member who finds the route is told plainly that they're a member, not shown an error
- [x] Session selector — first screen after sign-in. Lists today's sessions, usually one or two, and the registrar picks one; a single session opens without asking. Today is Omagh's calendar day, so a late finish stays on the night it belongs to, and the query is bounded to that day rather than fetching the table — `lib/training/tonight.ts`. A cancelled session is named rather than hidden: "nothing on tonight" and "Monday Track was called off" send a registrar in the rain to two different places
- [ ] Creating a session is the admin site's job, but the app keeps a fallback for the night nobody got round to it — a registrar blocked at the track by a missing row is exactly the failure this phase exists to avoid. The fallback asks for a group, since the Usuals list is useless without one
- [ ] Attendance view — the Usuals described above, not the full membership. One tap of the checkbox marks attendance: writes an `attendance` row and a paired `credit_transactions` row of `type = 'session'` with `session_id` set and keyed `session:{attendance_id}`, in a single transaction
- [ ] Record cash payment — tap the runner's cash cell, pick or key in the amount, writes a `top_up_cash` row with `session_id` always set, because a session was chosen before any name appeared
- [ ] Household balance visible inline against each name, so the registrar can see who needs to pay without opening anything

### Idempotency
- [ ] Use deterministic `idempotency_key` for all writes — `attendance:{member_id}:{session_id}`, `session:{attendance_id}` for the paired debit, `untick:{attendance_id}` for the adjustment that gives a mis-tapped charge back, `attendance:guest:{guest_id}:{session_id}`, and `cash:{member_id}:{client_uuid}`
- [ ] A take-back is keyed off what it reverses — `refund:{original_key}` — so a retried or double-tapped undo refunds once, which matters most on the flaky connection that prompted the retry
- [ ] Write with `ON CONFLICT (idempotency_key) DO NOTHING` so retries / offline-then-sync never double-write
- [ ] Test: queue an attendance write offline → bring app online → exactly one row appears
- [ ] Test: trigger sync twice in rapid succession → no duplicate
- [ ] Test: create a session in the PWA while offline → syncs as one session (deterministic client-generated `id`), attendance rows reference that `id`

---

## Phase 6 — Admin Reporting

A read-only reporting area inside `/admin` for committee operational needs. No new tables — these are queries and views over `members`, `credit_transactions`, `training_sessions`, `groups`, `guests`, and `attendance`.

- [ ] Create `src/pages/admin/reports.astro` — index page linking to the reports below
- [ ] Attendance by session — pick a session, see who attended and who didn't
- [ ] Attendance by group — headcounts and trends per squad, which is the question the group field makes answerable
- [ ] Attendance by member — pick a member + date range, see all sessions attended
- [ ] Member balances — current snapshot, with a sub-list of members in arrears (negative balance)
- [ ] Top-up summary — totals over a date range, split by method (cash only until card payment is unparked)
- [ ] Session summary — sessions per week, headcounts, trends over time
- [ ] **Session report** — one session on a page: who attended, what was charged, what cash was taken, and who recorded each entry
- [ ] **Day report** — every session on a given date rolled together, which is how a committee member actually asks the question ("how did Monday go?")
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
| 4 | Training credits, admin credit tools, member transparency view | — |
| 5 | Training sessions, groups, guests, attendance, registrar role, sign-in PWA | Phase 4 schema |
| 6 | Admin reporting area | Phase 5 schema |
