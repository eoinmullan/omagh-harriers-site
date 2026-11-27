# Members Area — Implementation Plan

Phases are intended to be shipped independently. Each phase is self-contained and leaves the site in a working state.

## Deployment Architecture

| App | Subdomain | Hosting | Backend |
|---|---|---|---|
| Public site + members area | `omaghharriers.com` | Cloudflare Pages (SSR via Pages Functions) | Supabase |
| Training sign-in PWA | `omaghharriers.com/registrar` | Same Cloudflare Pages project, prerendered route | Same Supabase project, same cookie session |

**Admin area** (`/admin/*`) lives inside the club site as SSR Astro pages — desktop management tasks (member list, credit adjustments, history). Gated by an admin role check in middleware.

**Training sign-in PWA** is a prerendered route on the main site with a React island — mobile-first, installable, used at sessions to mark attendance and record cash payments. Reached from a card in the members' area that only a registrar sees, so it installs already signed in. See *One origin, one sign-in* in Phase 5.

## Folder Structure

As built. The plan once had a second app for the sign-in PWA and a shared
`packages/supabase`; neither was needed, because the PWA is a route on the
site (see *One origin, one sign-in* in Phase 5).

```
omagh-harriers-site/
├── apps/
│   └── site/                       # @omagh/site — the whole of omaghharriers.com
│       ├── src/
│       │   ├── pages/              # public site, members/, admin/, registrar/, signin/
│       │   ├── layouts/            # Layout.astro, AdminLayout.astro
│       │   ├── components/         # Astro components; registrar/ is the React island
│       │   ├── lib/                # every rule, each with a *.test.ts beside it
│       │   ├── data/               # training-schedule.ts
│       │   └── middleware.ts
│       ├── public/                 # _headers; registrar/ holds the worker, manifest, icons
│       ├── scripts/                # sync-klubfunder.ts
│       └── package.json
├── supabase/
│   ├── migrations/                 # numbered, applied with `supabase db push`
│   └── scripts/                    # one-off SQL: test data, go-live clear-down
├── .github/workflows/ci.yml        # typecheck, test, build on every push to main and every PR
├── roadmap/                        # this plan, reviews/, committee/
├── OPERATIONS.md                   # dashboard settings and runbook
└── CLAUDE.md                       # the decisions
```

**CI/CD model:** one Cloudflare Pages project, **Root directory** `apps/site`,
build command `pnpm build:deploy`, which runs the typecheck and the tests
before building, so a failing check leaves the last deployment live. GitHub
Actions runs the same checks on every push to `main` and every pull request.
Pages owns deploys.

## Cost Summary

| Item | Annual cost |
|---|---|
| Domain (existing) | — |
| Cloudflare Pages | £0 (free tier covers a 40-member club many times over) |
| Supabase | £0 (free tier: 500MB DB, 50k MAU, plenty for this) |
| Stripe top-up fees | ~1.4% + 20p per transaction (e.g. 34p on a £10 top-up — paid by club, not member, unless the committee decides otherwise; see Phase 4) |
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

**The club started out on cash in, sessions out.** The committee decided on 17 Nov 2026 not to take card payments yet, and reversed that on 26 Nov 2026: Stripe top-up is going ahead. See the Stripe section below.

### Data model
- [x] Create `credit_transactions` table — `id`, `principal_id`, `amount_pence` (positive for credit, negative for debit), `type` (`'top_up_stripe' | 'top_up_cash' | 'session' | 'manual_adjustment' | 'refund' | 'transfer_in' | 'transfer_out'`), `member_id` (nullable, set when the transaction is tied to a specific member — typically `'session'`), `idempotency_key` (unique), `notes`, `created_by`, `created_at`. A CHECK ties the sign of the amount to the type, and a trigger makes the table append-only — a mistake is corrected with a compensating row, not an edit. An `attendance_id` was pencilled in for Phase 5; Phase 5 decided against it, for the reason recorded there
- [x] RLS: principals can read transactions for their own household; admin/superuser role can read/write all
- [x] Create a `principal_balances` view that sums `credit_transactions.amount_pence` per principal

### Member-facing (transparency)
- [x] Create `src/pages/members/credits.astro` — current balance + full transaction history with each row clearly labelled by method (Stripe vs cash). Session debits name the member; the session name and date follow in Phase 5, when `training_sessions` exists
- [x] Use human-readable line formats, e.g. *"£10.00 added — paid by card via Stripe"*, *"£10.00 added — paid by cash at training, recorded by Eoin Mullan"*, *"£2.00 deducted — Monday Track Speed"* (`src/lib/credits/transactions.ts`)
- [x] Link credits page from `/members` dashboard — the dashboard shows the balance itself

### Stripe top-up — going ahead (committee decision, 26 Nov 2026)

Parked on 17 Nov 2026, approved on 26 Nov 2026. Already in place from when it
was parked: the `top_up_stripe` transaction type, its CHECK constraint, and the
*"paid by card via Stripe"* line format with its test. Nothing in the shipped code
yet offers card payment: there is no top-up button and no route.

**Open questions, to settle before building:**

- **Amounts.** £10 / £20 / £40 was pencilled in and never confirmed. Fixed buttons only, or a custom amount with a minimum?
- **Who pays the fee.** The plan says the club absorbs ~1.4% + 20p. Confirm, or pass it on (and if so, how the line reads on the statement)
- **Stripe account access.** Who holds the club's Stripe login, and whether a restricted key is enough rather than the full secret key
- **Refunds.** Is unused card credit refunded to the card through Stripe, or handed back as cash like everything else? The terms (decision 7 in `committee/privacy-and-terms.md`) currently say cash or transfer only
- **Running on Cloudflare.** The Stripe Node SDK needs its fetch HTTP client and `constructEventAsync` (SubtleCrypto) on Workers. Confirm before committing to the SDK over plain `fetch`
- **Middleware.** The webhook route must sit outside `/members` and `/admin`, or the auth gate will refuse Stripe
- **Terms and privacy notice.** Stripe becomes a processor of payment data, and card payment needs its own terms (see the Ts&Cs work in Phase 8)
- **Registrar app.** Does the balance a registrar sees need to say a card top-up is pending? A webhook normally lands within seconds, so probably not

- [ ] Retrieve API keys from existing club Stripe dashboard (Standard account)
- [ ] Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to env
- [ ] Create `src/pages/members/topup.astro` — fixed amount buttons (£10 / £20 / £40, pending final stakeholder confirmation), creates Stripe Checkout session with `principal_id` in metadata
- [ ] Create `src/pages/members/topup/success.astro` — post-payment confirmation page
- [ ] Create `src/pages/api/stripe/webhook.ts` — Astro API route, verifies Stripe signature with the service-role Supabase client, writes `top_up_stripe` transaction using the Stripe event ID as `idempotency_key`
- [ ] Register webhook endpoint in Stripe dashboard
- [ ] Test: £10 top-up via Stripe Checkout → balance updates
- [ ] Test: replay the same webhook event → no duplicate transaction (idempotency)

### Admin tools
- [x] Create `src/pages/admin/credits.astro` — club float plus every household's balance, filterable, each linking to `/admin/credits/[id]` where the cash payment or adjustment is recorded. Two pages rather than one, mirroring `/admin/households`: the household you are recording against is the household you are looking at
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
- [x] Create `training_sessions` table — `id`, `group_id` (FK → `groups`), `starts_at` (timestamptz), `note` (nullable), `price_pence` (NOT NULL), `is_cancelled`, `created_by`, `created_at`. **`name` and `location` were dropped in `0014`** — see *A session is a squad and a time* below
- [x] `price_pence` is set from a **£2** constant in code at creation time. The session keeps its own copy, so changing the constant never rewrites a session that has already run, and never touches the ledger, which records what was actually charged
- [x] Relax `training_sessions.price_pence` from `CHECK (price_pence > 0)` to `>= 0`, so a free session can exist — **migration `0012`, written and tested locally, not yet applied to the live project**
- [x] Create `member_groups` — `member_id`, `group_id`. Which squads a member trains with. This is what makes the Usuals list useful on day one, before any attendance history exists
- [x] Create `guests` table — `id`, `first_name`, `surname`, `created_at`, `created_by`. A returning guest is picked from this list rather than retyped, which also stops one person becoming three through spelling
- [x] Create `attendance` table — `id`, `session_id` (FK → `training_sessions`), `member_id` (nullable), `guest_id` (nullable), `amount_paid_pence` (nullable, guests only — they pay instead of drawing on credit), `recorded_by`, `idempotency_key` (unique), `created_at`, with a CHECK that exactly one of `member_id` and `guest_id` is set
- [x] Add `session_id` (nullable FK) to `credit_transactions` — a cash top-up taken at the track belongs to that session. Without it, "cash taken tonight" cannot be computed and the tin cannot be checked against anything
- [x] **The registrar app always sets it; the admin site never does.** The app cannot show a list of names without a session being chosen first, so the link is free — there is no screen where a registrar could record a top-up and leave it unattached. A top-up away from the track is the admin site's job, where `session_id` stays null. Both are supported, and which one happened is then a fact rather than a guess
- [~] **Not as written: the line names the night, not the squad** — *"£10.00 added — paid by cash at training on Tue 17 Nov, recorded by Eoin Mullan"* (round 3). A line is dated when it was entered, so a night put right later from Past sessions needs its own date. Originally: session-linked top-ups read as *"£10.00 added — paid by cash at Middle Distance Group, recorded by Eoin Mullan"* in `credits/transactions.ts`. The session name only: `/members/credits` already prints the date on its own line beneath each entry, so repeating it would read as a stutter. An unlinked top-up keeps today's wording, *"paid by cash at training"*
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
- [x] Manage groups from the same area — add one, rename one, retire one. A retired group keeps its history. `/admin/squads`, with the near-duplicate check deliberately stricter than the `lower(name)` index — see *Two groups nobody can tell apart* below
- [x] Assign members to groups, so a new session's Usuals list is populated before anyone has attended anything. `/admin/squads/[id]`, with the forgiving type-to-filter the registrar screen settled on, shared from `training/names.ts`
- [x] Allow editing name/location/price; cancellation is a soft-disable, not a row drop, so attendance history stays intact. A session that has attendance against it keeps its price — editing it would contradict the ledger. The price field disables itself once somebody has signed in, and says why
- [x] Past sessions are a first-class view, not a by-product: headcount, cash taken, and who recorded each entry. The per-registrar split only appears when more than one person recorded something, because that is the only time it is a question
- [x] Add a `registrar` role — today the only role that can write is `admin`, which can also reassign roles, deactivate households and move balances. A volunteer signing runners in on a borrowed phone needs none of that. Granted from `/admin/households/[id]`, which was already the superuser-only place roles are set

### PWA setup
- [x] ~~Add `apps/signin` package — Vite + React~~ — **dropped.** It is `apps/site/src/pages/registrar/` with a React island in `components/registrar/`, which is what makes a single sign-in possible at all
- [x] ~~Share Supabase types via a `packages/supabase` workspace package~~ — **dropped with the second app.** One app, one copy; `src/lib/supabase/types.ts` stays where it is
- [x] ~~Configure Cloudflare Pages deployment from `apps/signin`, point `signin.omaghharriers.com` at it~~ — **dropped.** One origin, one deployment, one set of env vars, no second redirect allow-list and no DNS record
- [x] Connect to the same Supabase project — the site's own cookie session, through the existing `createSupabaseBrowserClient`, with the role read from the **`app_role`** claim on the token so the app knows what to draw with no signal. RLS gates every write — `lib/training/registrar.ts`
- [x] Web App Manifest, icons and the standalone metadata, served only on `/registrar` so Add to Home Screen anywhere else bookmarks an ordinary page. Scope `/registrar` keeps the installed window out of the rest of the site
- [x] Service worker — `public/registrar/sw.js`, registered only from the island. Served from `/registrar/` so the browser caps its scope there, which is also why the app is canonically `/registrar/` with the trailing slash. Network-first for the shell, cache-first for hashed assets, cross-origin never touched. Reads are cached too — tonight's session list and the night's data, both in IndexedDB, so the app opens at a track with no signal and shows what this phone last believed
- [x] Offline write queue — IndexedDB store, flushed when connectivity returns, with a two-second coalescing window so a mis-tap never reaches the database. `lib/training/queue.ts`

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

#### The tick is one transaction

`attendance` and `credit_transactions` are two tables, and PostgREST cannot
write both in one statement. A phone that managed only one would leave a runner
present and uncharged, or charged and absent — so the tick is an RPC:
`sign_in_member(member, session [, attendance_id])`, with
`undo_member_sign_in(attendance_id)` as its other half. **Migration `0011`.**

`attendance_id` is optional and exists for the offline queue: a phone that fixes
the row's identity at tick time can retry the same call for hours, because every
key is derived from ids settled before the queue was written.

Both are SECURITY INVOKER. RLS already says who may write what; a definer
function would restate that rule and be where it goes stale. The role check at
the top of each only turns a silent denial into a sentence.

Proved locally against a throwaway Postgres 17 with the whole migration chain
replayed and RLS on, acting as a registrar rather than as the owner:

- a retried tick returns the same attendance row and charges once
- the debit is negative, typed `session`, and carries the session and the member
- an untick removes the row and returns the money, noted *"Monday Track sign-in
  corrected for Jack"*
- a double-tapped untick credits once
- a re-tick mints a fresh attendance id and charges again
- a free session records attendance and no ledger row, and unticking it gives
  nothing back
- a member is refused; an admin is allowed; a cancelled session is refused
- unticking a row that is already gone is quiet, and unticking a guest says so

**Applied to the live project** (`0011`, `0012`, and `0013`) on 19 Nov 2026 via
`supabase db push`, after `supabase migration list` confirmed the remote history
was in sync and a `--dry-run` showed only those files would go.

`0013` repairs a guard in `0011` found by calling the functions with the anon key
straight after pushing: `IF NOT can_run_a_session()` does not fire when the claim
is missing, because `NOT NULL` is NULL rather than true. Nothing was exposed —
an anon caller has no `auth.uid()`, and RLS refuses a NULL role on every insert
regardless — but the guard was not doing the job it was written to do.

### Member-facing

- [x] Training history in the members' area — which sessions each member of the household attended and when. **Merged into `/members/credits`** on 21 November: every paid session was already a line on the statement, so the page lists sessions and payments together, newest first, names the squad on each session, adds a line for free sessions (which leave no ledger row), and offers a filter by member when two or more have lines. `/members/training` redirects there

### The Usuals — who the registrar actually sees

300 members are in the database and 10 to 20 turn up to any given session. Juniors are
never at a senior session, sprinters never at an endurance one. The group on the session
is what makes that knowable, which is the real reason groups are worth having — the
reporting value is a bonus.

They are **the Usuals** on screen and in the code. "Shortlist" named the mechanism;
"Usuals" is what the people running the session already call them.

- [x] Default view is the Usuals for this session's group
- [x] **Attendance frequency decides who is on the list. Surname decides the order it is read in.** The plan previously asked for both as the ordering, which cannot hold at once. Frequency is a filter, not a sort: ordering by it would scatter siblings, and finding a name is the job the registrar actually has
- [x] Seed the Usuals from `member_groups`, then let attendance history refine who makes the cut. History alone starts empty, which on the first night would be worse than no feature at all. The history query is an inner join filtered on the group, so the narrowing happens in the database rather than by fetching every attendance row the club has ever recorded
- [x] The registrar can add somebody to the list by hand — anyone ticked is on the Usuals by definition, including somebody found through Everyone, so it needs no second control. **Dropping somebody by hand is not built**: it would need per-session state nothing else wants yet
- [x] Second toggle: the full member list. Third toggle: guests seen before, so a returning non-member is a tap rather than a retype — and the picker offers whoever is already on file before Add is reached
- [x] **Order everyone by surname, everywhere.** Siblings arrive together, so the next two people the registrar needs are adjacent
- [~] **Both figures in the header are filters.** Tapping the headcount shows who is here — built. **Money collected** comes with the cash cell. Tapping **Money collected** shows who has handed something over. A number and the names behind it are one control, so when the tin does not match there is nothing to go hunting for. One filter at a time — tapping either clears the other — and both answer for the whole night, not just the list that happens to be open, or the number would be describing people the registrar cannot see
- [x] The here filter is taken from the rejected board prototype, where watching the night fill up was the one thing it did better than a list
- [x] **One way into the full list: type part of a name.** An A–Z index was built and abandoned. With 313 members, M still returns more people than anyone can read standing at a track — a letter narrows the problem rather than solving it, and it costs a row of screen whether or not it is used. The full list simply stays on screen and shrinks as characters arrive. The box belongs to that list and appears only there — see *Match the prototype's look* below
- [x] **Matching is forgiving on both sides.** Lower-case and strip whitespace, apostrophes, hyphens *and accents* from the stored name *and* from what is typed, so "O'Kane", "O Kane" and "okane" are one name, and Siobhán is found by typing Siobhan. Shared with the admin screens through `training/names.ts`
- [x] Match anywhere in either name, not only the start. A registrar who knows somebody as Kane should not have to remember the O, and by three characters the list is short regardless

### Registrar experience

- [x] **No undo button — every control carries its own state.** The ledger is append-only and a pressured registrar will mis-tap, so the recovery has to be as obvious as the mistake. A floating undo is a second affordance with its own timeout, pointing at an action that has already scrolled away. Instead the control that did the thing is the thing that shows it, and using it again reverses it
- [x] **Attendance is a checkbox.** Ticked means here, and £2 charged. Unticked means not signed in yet. Current state is on the row being looked at, nowhere else, and correcting a mis-tap is the same gesture again. The whole row is the control, not a small square beside it
- [x] **Cash works the same way, which is harder, because an amount is not a yes or no.** The cash cell on a row is both control and display: it reads `+ £` when nothing has been taken from that runner tonight, and the amount itself once something has. Tapping an empty cell offers the amounts; tapping a filled one offers to change it or take it back. There is no state the registrar has to carry in their head
- [x] Quick amounts cover the common cases, but **an arbitrary amount must be enterable**. Digits shift in from the right, cash-machine style, so there is no decimal point to place in the cold and the dark
- [x] The row shows **one figure per runner — what they have handed over tonight.** Changing £10 to £15, or taking it back entirely, writes the compensating `refund` described below. The screen shows where it landed; the ledger keeps every step that got there
- [x] **Cash is a household fact, like the balance it feeds.** £10 handed over for one of three siblings reads the same on all three rows, because it is the same £10 going into the same pot. Tapping any sibling's cash cell edits the one figure, and the sheet names the household and its members rather than the row that was tapped
- [x] This means a `top_up_cash` row taken at the track leaves `member_id` null, which is what Phase 4 already does — the money belongs to the principal, and `created_by` plus `session_id` say who took it and where. Only `session` debits name a member
- [x] **Household balance, not member balance.** Credit belongs to the household, so signing in the second of three siblings must show the pot draining, not three copies of the same number — the tick moves the pot optimistically, on every row that shares it
- [x] **One line under a name, and it only ever says one thing:** what that household's pot holds right now, attributed to the principal — *"£8.00 · Ash Ashby"*. The principal's full display name rather than a surname: splitting a name on a space to find the surname breaks on the first "van der Berg", and the line is small and grey either way. It never narrates the night. The tick takes £2 off it and the cash cell puts money on, so both controls are legible there without the wording ever changing. Colour carries the warning — neutral in credit, amber below the price of a session, red overdrawn — because a line whose words change with the number is a line the registrar has to read rather than glance at
- [x] **Guests.** Record a name, mark them in, take the money at the time. No account, no credit, no balance that can go negative
- [x] **A guest's row carries no money control.** Ticking them in takes the session price in cash and that is the whole transaction — there is nothing to add funds to, because they hold no credit to add them to. The figure beside the name states what they paid and cannot be edited; a wrong tick is cleared by unticking, which takes the attendance row and the cash with it
- [x] **Cash reconciliation, informational only.** A running total of what has been taken tonight, there to be glanced at so the tin can be checked against it. No confirmation step and nothing to tap — the registrar is told, not asked to sign for it
- [x] Cash for a session is `top_up_cash` plus `refund` from `credit_transactions` carrying that `session_id`, plus `amount_paid_pence` on the session's guest attendance rows. Session debits are excluded — they move credit, not money. Grouping by `created_by` gives the same figure per registrar, which is the one that matters when two phones are open
- [x] **Taking a cash payment back writes a `refund`, not a negative top-up.** The sign CHECK forbids a negative `top_up_cash`, and a `manual_adjustment` would be both unattached to the session and misleading on the member's page. `refund` is already constrained negative and already means money going back out, so the running total nets out on its own
- [x] Unticking a guest deletes the attendance row. Guests have no ledger to compensate against, and attendance is not append-only — only `credit_transactions` is
- [x] `describeEntry` should surface a refund's note the way it does for an adjustment. *"£10.00 deducted — refunded"* does not say why, and a keying slip corrected in front of the member deserves a reason
- [x] The total is only complete once every device has synced. A registrar working offline sees what their own phone has taken, not the session's — say so on screen rather than showing a confident wrong number. The figure is labelled **Money collected**, so that caveat has to appear under it when it applies rather than hiding in the label, which is the right trade: the common case reads plainly and the exception announces itself
- [x] **Two registrars at once.** A busy track will have more than one phone open on the same session. Idempotency keys stop a double charge. When a phone's writes land it sends an empty "changed" nudge on a Supabase Realtime Broadcast channel, and so does the admin site when a form succeeds; the other phone refreshes within about a second, but only when it owes nothing, so a tick never vanishes from under the registrar. A once-a-minute poll, and coming back to the app, catch a missed nudge. The nudge carries no data, so there is nothing to merge (`lib/training/{nudge,watching}.ts`)
- [x] **Built for the conditions.** Large targets, high contrast, legible under floodlights and in rain, usable one-handed and with cold fingers. No small text, no long presses, no precision gestures
- [x] Paper fallback — a printable session list, for the night a phone dies. `/admin/sessions/[id]/sheet`: the same Usuals the app would show, ordered by surname, with a tick box, each household's credit, a column to write cash in, and spare lines for whoever turns up unexpected. An admin page, because printing happens sitting down — a registrar at the track with a dead phone is not printing anything

### PWA core features
- [x] Registrar sign-in — there is no sign-in form. The session is the members' area's own cookie session, which is the whole point of *One origin, one sign-in*. A member who finds the route is told plainly that they're a member, not shown an error
- [x] Session selector — first screen after sign-in. Lists today's sessions, usually one or two, and the registrar picks one; a single session opens without asking. Today is Omagh's calendar day, so a late finish stays on the night it belongs to, and the query is bounded to that day rather than fetching the table — `lib/training/tonight.ts`. A cancelled session is named rather than hidden: "nothing on tonight" and "Monday Track was called off" send a registrar in the rain to two different places
- [x] **A registrar can create a session at the track, as a first-class thing rather than a fallback** — see *Nobody should have to book the night in advance* below. It asks for a group, since the Usuals list is useless without one. The id is minted on the phone and the write queues like any other, so it works with no signal and attendance queued behind it lands after it
- [x] Attendance view — the Usuals described above, not the full membership. One tap of the checkbox marks attendance, through `sign_in_member` so the attendance row and the paired debit are one transaction. The tick is optimistic and taken back if the write fails — `lib/training/night.ts`
- [x] Record cash payment — tap the runner's cash cell, pick or key in the amount, writes a `top_up_cash` row with `session_id` always set, because a session was chosen before any name appeared
- [x] Household balance visible inline against each name, so the registrar can see who needs to pay without opening anything
- [x] **Back and forward behave as in a native app.** A session is a history entry, so back returns to today's list and forward reopens it; the cash sheet and the squad picker close on back; a reload reopens the session; and back never leaves the app for the website it was opened from (`useHistoryLayer`, `useStayInTheApp`)
- [x] **A save indicator in the header**, *Saved*, *Saving* or *Offline*, in a slot of fixed width, so writes going out don't move the list

#### Nobody should have to book the night in advance

Spond makes an admin create every session before it happens. Decided on
19 Nov 2026 that this is a bug rather than a feature, and that the registrar app
will not copy it: a registrar turns up, finds no session, makes one, picks the
group, and starts ticking people in.

The plan already had this as a *fallback for the night nobody got round to it*.
It is promoted to the normal path. Creating a session in the admin console stays
available and is still the tidier way to do it in advance, but nothing depends
on it having happened.

**No migration is needed.** `0010` already carries the policy, with a comment
anticipating this exact case:

> Registrars may create a session as well as read one. Creating sessions is the
> admin site's job, but a registrar blocked at the track by a row nobody got
> round to adding is exactly the failure this phase exists to avoid.

Editing one stays with admins, which is the right split: a registrar can bring a
session into existence but cannot re-price it or cancel it, because those have to
agree with a ledger they cannot see the whole of. A session they create takes
`DEFAULT_SESSION_PRICE_PENCE`.

**The hazard is two registrars creating the same session.** A busy track has more
than one phone open, and two people each adding "Monday Track" for the same group
on the same night splits the evening in half: two headcounts, two Money collected
figures, and members charged against whichever row their registrar was holding.
Idempotency keys do not help — these are two genuinely different sessions as far
as the database is concerned.

What to do about it:

- **Show what already exists before offering to make one.** The session picker
  already lists tonight; the create control belongs underneath that list, not in
  place of it
- **Warn on a near-duplicate rather than refusing it.** If the chosen group
  already has a session tonight, say so and name it — *"Endurance already has a
  session at 19:00. Did you mean that one?"* — with carrying on still possible.
  A hard constraint is wrong: the schema deliberately allows a member at two
  sessions in a day, and a group genuinely can train twice
- **The id is generated on the phone**, so a session created with no signal syncs
  as one session rather than one per retry. Already required under *Idempotency*

**Groups are the one thing that must exist in advance.** A session belongs to a
group and the Usuals come from it, so a registrar cannot create a session for a
squad nobody has set up. As of 19 Nov 2026 the live project has **no groups at
all**, which means this feature would be unusable today — seeding the squad list
is a prerequisite, not a detail.

#### Match the prototype's look, not just its shape — done

The prototype settled *what the screen is* — a list, not a search or a board —
and the plan recorded that. Nobody wrote down that it should also look like it,
so the built screen was made from the written spec and the prototype's visual
treatment was never carried across. Decided on 19 Nov 2026 that it should be:
**match the final `prototype/registrar-screen` version exactly.**

What the prototype does that the built screen does not:

- **The club's amber is the accent.** A ticked checkbox is amber on black, cash
  figures are amber, and `--color-amber` is already in `global.css` because the
  public site uses it. The built screen is slate and emerald throughout and
  carries no club colour at all
- **The surname is bold and upper-case, the first name is not.** Scanning a list
  of three hundred names for one surname is the job, and the typography does
  that job rather than leaving both halves the same weight
- **It is a list, not a stack of cards.** Rows separated by a hairline, no gaps
  and no rounded corners, which fits more names on a phone and reads as one
  thing to run a finger down
- **The cash cell has two lines**: the amount, and a small upper-case *added* or
  *paid* beneath it, so the figure says what it is without a legend
- **Round amounts drop their pence** — "£10", not "£10.00" — which is how the
  money is actually spoken at the gate

Done on 19 Nov 2026, matching the prototype including the search box, which
appears only on the full list and hides while a header filter is on. That
supersedes the earlier note under *The Usuals* about typing searching the whole
club from any tab: the Usuals are short enough to read without one, and a filter
has already narrowed the night to an answer.

`prototype/registrar-screen` is pushed, since it is the reference for how this
screen looks.

#### A session is a squad and a time

Decided on 20 Nov 2026: `name` and `location` come off `training_sessions`, and
one optional `note` replaces them. Migration `0014`.

Neither column ever earned its place, and the club's own first three sessions
prove it. The registrar app names a session after its own group, because there
is nothing else to call it. The one session created by hand was called **"Wed"**
— a name that says strictly less than the start time sitting next to it. A
field that is either a duplicate of the group or a shrug is a field to remove.

What is left identifies a session completely: the squad it is for and when it
started. `groups.name` is the label on every screen, and the untick's ledger
note names the squad instead — *"Middle Distance sign-in corrected for Jack"*,
which reads better than the session name ever did.

`note` is nullable and expected to be null on almost every session. It covers
what `location` was reaching for ("top car park") and the things it never could
("juniors only", "coaches away, easy run"). It shows on the picker, so a
registrar reads it before they pick, on both admin screens, and on the printed
sheet.

**This is a destructive migration** — two columns dropped. Nothing of value is
lost today: the only strings in them are "Wed", "ZZ Verification session" and
"Not a real session".

#### One outbox, owed by the phone

Both rough edges the offline work left behind turned out to be the same
mistake: the queue was scoped to a screen when it is owed by the phone.

It was keyed per session and mounted inside the attendance view, so work
pending for Monday's session sat untouched while the registrar looked at the
picker or at another session. Nothing was lost — reopening sent it — but
"flushed when connectivity returns" was not true. There were two of them, in
fact: a second queue keyed `track-sessions` for sessions started at the track,
which could not see the first.

Now there is one outbox, mounted at the island root, alive for as long as the
app is open and whatever is on screen. Anything left under the old per-session
keys is swept into it on load and the old key dropped, so a queue stranded by
the previous shape is sent rather than forgotten.

**A queued write names its own author.** The guest sign-in used to have
`recorded_by` handed to it at send time, which meant a write queued at seven
depended on who could be resolved at nine. Every other write already carried
its author — the RPCs read it from the token, the cash and session rows have
`created_by` on them — and this one now does too.

The screen catching up falls out of the same change. A queue restored from
storage lands *after* the screen has loaded, so the database has moved and the
screen cannot know; the outbox counts each time a restored backlog clears and
the view reloads on that. Reloading after every tap would be a round trip per
tick, and the optimistic state is already correct in that case — this is one
round trip per opening of the app, in the only case that needs it.

### Idempotency
- [x] Use deterministic `idempotency_key` for all writes — `attendance:{member_id}:{session_id}`, `session:{attendance_id}` for the paired debit, `untick:{attendance_id}` for the adjustment that gives a mis-tapped charge back, `attendance:guest:{guest_id}:{session_id}`, and `cash:{member_id}:{client_uuid}`
- [~] A take-back is keyed off what it reverses — **not as written**. Cash entries are keyed `cash:{principal_id}:{client_uuid}` and `refund:{principal_id}:{client_uuid}`, one uuid per action, because a partial change has no single "original" to key off. A double-tapped undo is stopped a step earlier instead: the second tap finds the figure already where it was asked to be and plans no row at all. The uuid must be preserved across retries of the same action, which the queue does by storing the planned row rather than replanning it
- [x] Write with `ON CONFLICT DO NOTHING` so retries / offline-then-sync never double-write — untargeted, because a retry can trip either the unique `idempotency_key` or the unique `(member_id, session_id)`. CHECK violations still raise, which is wanted. In `sign_in_member` / `undo_member_sign_in`, migration `0011`
- [~] Test: queue an attendance write offline → bring app online → exactly one row appears. **Driven against the live database, but with the connection up**: a tick landed as exactly one attendance row and one debit, a tick-then-untick inside the window wrote nothing at all, and an untick after the write had gone produced a real reversal. A genuine signal-loss test still wants doing on a phone
- [x] Test: trigger sync twice in rapid succession → no duplicate. `useWriteQueue` runs one send at a time, `queue.test.ts` checks a double flush is safe, and every write is `ON CONFLICT DO NOTHING` on its key
- [~] Test: create a session in the PWA while offline → syncs as one session (deterministic client-generated `id`), attendance rows reference that `id`. **Unit tested only**: `track-session.test.ts` checks the phone's id makes a retry one session, and `queue.test.ts` that the session stays ahead of the attendance that references it. A genuine signal-loss test still wants doing on a phone

---

## Phase 6 — Admin Reporting

A read-only reporting area inside `/admin` for committee operational needs. No new tables — these are queries and views over `members`, `credit_transactions`, `training_sessions`, `groups`, `guests`, and `attendance`.

- [x] Create `src/pages/admin/reports.astro` — index page linking to the reports below. `/admin/reports`, a **Reports** tab in the admin area, which opens on the attendance report, with a switch to the money report. Two reports remain; the rest are answered by existing screens, as marked below. A proof of concept, with no requirements behind it yet
- [~] Attendance by session — **who attended is `/admin/sessions/[id]`**. Who didn't (absent Usuals) isn't built, because nobody has asked for it yet
- [x] Attendance by group — headcounts and trends per squad. `/admin/reports/attendance`: week by week, a column per squad
- [~] Attendance by member — **the member's admin page lists their 20 most recent sessions**, and a household sees its own on `/members/credits`. No date range, because nobody has asked for it yet
- [x] Member balances — **already `/admin/households`**: a sortable balance column, the Overdrawn and In credit filters, and the club float
- [x] Top-up summary — `/admin/reports/money`: cash at training, guest payments, money handed back, and cash an admin recorded, by kind and by who recorded it. The cash rule is `session-cash.ts`'s
- [x] Session summary — the same report as attendance by group, whose All squads column is sessions and headcount per week
- [x] **Session report** — **already `/admin/sessions/[id]`**, which shows all four
- [x] **Day report** — every session on a given date rolled together, which is how a committee member actually asks the question ("how did Monday go?"). Built, then removed in the simplification review (U3): `/admin/sessions` is grouped by day instead, with a total for a day that ran more than one session
- [x] CSV export on each report — on both, as `?format=csv` on the same URL
- [x] Gate `/admin/reports` to `role IN ('admin', 'superuser')` in middleware (already covered by `/admin/*` rule)

---

## Phase 7 — Review, before go-live

Everything above is built by somebody who is also the only person reviewing it.
This phase is the pass that treats the whole thing as somebody else's code.

**The gate is go-live, not Phase 6.** Reviews run once the reporting area is
finished and before the club is asked to rely on any of it — which is the same
point in the calendar and states the actual constraint. Until then the database
holds no real money and no real attendance, so a finding that costs a migration
costs roughly what it would have cost at any earlier point. That is why this is
one block at the end rather than a gate part-way through: reviewing the ledger
before the cash cell, refunds and the offline queue exist would mean reviewing it
twice, and reviewing privacy before the reporting area exists would mean looking
at the smaller half of the problem.

### How the reviews are organised

Ordered by how expensive a finding is to act on, so that the reviews whose
findings change the shape of things run before the ones that judge the details.

| Round | Reviews | Why here |
|---|---|---|
| 1 | Data integrity · Security · Privacy | Findings change the schema and the trust model |
| 2 | Backend · Frontend · Code quality | The code as written |
| 3 | Performance · Usability · Accessibility · Operational resilience | How it behaves once the code has settled |
| 4 | Data integrity (delta) · Security (delta) | Confirm rounds 2 and 3 did not undo round 1 |

**Only two reviews repeat, and only as a delta.** A second full pass over
unchanged code finds what the first one found, at the same cost. Security and
data integrity are the exceptions because they are the invariants the other
reviews characteristically break: performance fixes loosen queries, add caching
and batch writes; usability fixes add undo buttons and debounce taps. Both are
how a double charge or a visible row that should not be gets introduced. The
delta pass is scoped to the diff rounds 2 and 3 produced, not to the codebase.

**Granularity: split by component only where the component changes the question.**
Nine reviews across seven components is sixty-odd passes and most of them are
empty — there is no useful performance review of a migration file. Only security
and data integrity are split, because there the components genuinely have
different threat models.

### Round 1 — schema and trust model

- [x] **Data integrity: can the ledger lie?** ([findings](reviews/round-1-data-integrity.md)) Not a general backend pass. One
  question, pursued hard: is there a sequence of events that leaves a household's
  pot wrong? Append-only with compensating rows, a balance that is a `SUM` over a
  view, idempotency keys, an optimistic UI that moves a balance before the write
  lands, two registrars on the same session, and a queue flushing hours later
  - [x] The ledger — `credit_transactions`, `principal_balances`, `credits/ledger.ts`, the sign-in RPCs
  - [x] The sync reconciliation — `sync/klubfunder.ts` moving a member between households, lapsing and reactivating, and what either does to a balance
- [x] **Security**, split by threat model ([findings](reviews/round-1-security.md)):
  - [x] Public site and the auth flow — `/signin`, the OAuth round trip, the email-match check in `/signin/callback`, the terms gate, middleware
  - [x] RLS and the database — every policy against the `app_role` claim, the append-only trigger, `SECURITY INVOKER` on the RPCs, and what a `TRUNCATE` still bypasses
  - [x] Admin service-role paths — every page using `createSupabaseAdminClientFromLocals`, which bypasses RLS entirely
  - [x] The registrar island on the anon key — what a volunteer's phone can read and write, and what a tampered token claim would get
  - [x] **The Klubfunder CLI** — a threat model of its own. It creates and bans auth users and re-points children between households from a CSV somebody downloaded. 995 lines, the largest module in the project, and the easiest one to leave out of a review of "the app"
- [x] **Privacy and data protection.** The club holds children's names and dates
  of birth, parent emails and payment records, and a registrar can read the whole
  club. `privacy.astro` mentions "date of birth" once and "delete" once: there is
  no retention story, no lawful basis stated, and nothing about what happens to a
  lapsed junior's record. Findings here may be committee work rather than code,
  so they want lead time
  - [x] Everything that exists before Phase 6 ([findings](reviews/round-1-privacy.md)) — six code findings and eight for the committee
  - [x] The reporting area and its CSV exports, once Phase 6 is built — the larger half, and the reason this box stays open. Done 21 November: P7, P8 and C9 in the [findings](reviews/round-1-privacy.md#the-phase-6-pass)

### Round 2 — the code as written

- [x] **Backend** ([findings](reviews/round-2-backend.md)) — migrations, RLS policies, the RPCs, PostgREST query shapes, the sync CLI
- [x] **Frontend** ([findings](reviews/round-2-frontend.md)) — the registrar island, the Astro pages, state handling, the optimistic write path
- [x] **Code quality** ([findings](reviews/round-2-code-quality.md)) — the lib-module contract (rules out of pages, unit tested without a database) and whether it has held. Includes the test suite itself: **CI runs `typecheck` and `build` but not the tests**, so 293 tests pass only when somebody remembers to run them

### Round 3 — behaviour

- [x] **Performance** ([findings](reviews/round-3-performance.md)) — the queries behind each screen, what the registrar app fetches on open, the reporting area over a few seasons of attendance
- [ ] **Usability** — against the registrar experience bullets in Phase 5, with somebody who is not the author
- [x] **Accessibility** ([findings](reviews/round-3-accessibility.md)) — separately from usability. The balance line deliberately uses colour as the carrier ("colour carries the warning, never the wording"), which is right for a glance and a WCAG failure if colour is the only channel. Also the custom `role="checkbox"` rows, focus handling, and the island under a screen reader
- [x] **Operational resilience** ([findings](reviews/round-3-operational-resilience.md)) — what breaks at seven on a wet Monday. Supabase unreachable mid-session; the `0003` access-token hook that has to be registered by hand in the dashboard and is in no migration; the Microsoft secret that expires on a date held in a constant; a bad content deploy taking the registrar app down now that it shares an origin

### Round 4 — delta

- [x] **Data integrity**, scoped to what rounds 2 and 3 changed ([findings](reviews/round-4-data-integrity.md)): D4-1, a replayed guest untick can delete the guest's next sign-in
- [x] **Security**, scoped to what rounds 2 and 3 changed ([findings](reviews/round-4-security.md)): S4-1, low

### After round 4

Two passes that weren't in the original plan, run once the reviews above
had settled the code.

- [x] **Simplification** ([findings](reviews/round-5-simplification.md)) — every screen, looking for features to pare down. U1 to U6, all made: squads search for members rather than listing the club, the admin session charge and the day report went, the registrar's Check again gave way to a refresh, the lists lost their database columns, and the household page leads with credit
- [x] **The registrar app, screen by screen** ([findings](reviews/round-6-registrar-app.md)) — at phone size with the live data. R1 to R7, all made, the first being a Paid view whose rows added up to nearly twice the tin

---

## Phase 8 — Child Safeguarding & Emergency Contacts

Agreed with the committee on 26 Nov 2026. Guardians fill in a safeguarding form
for each child; coaches and officers can see it when they need to; a second PWA
puts it in a coach's hand at the track when something happens to a child; and
the registrar app shows which children still have no form on file.

**This is the most sensitive data the club will hold.** Children's health
information is special category data under UK GDPR, so it needs an Article 9
condition as well as a lawful basis, and almost certainly a DPIA before it is
collected. Phase 7's reviews covered everything up to Phase 6; this phase
needs its own privacy, security and data-integrity passes before real forms
are collected.

**Status: scoping.** The form's contents are TBC, and the open questions below
are to be settled in a later session.

### Safeguarding form (members' area)

- [ ] `/members/safeguarding`: one form per child in the household, filled in by the household's login
- [ ] Shows on the members' dashboard which children have no form on file, and links straight to it
- [ ] Rules in `lib/safeguarding/` (a form in, a row or one sentence out), unit tested like everything else
- [ ] Guardians can view and update what they've submitted

### Storage and access

- [ ] Migration: a safeguarding table (or tables) keyed by `member_id`, with RLS
- [ ] Coach access (a role or a flag; see *How roles are modelled* below), and some form of officer access (welfare officer?), added to `roles.ts`, the access-token hook and `/admin/households/[id]`
- [ ] Column grants so registrars can tell *whether* a child has a form, and nothing else (see *A login reads columns, not rows*)
- [ ] Admin/officer screen to see a child's record and which children have none

### Emergency contacts section (trackside incidents)

**It isn't a coaching app.** Coaches are who use it most, but what it does is
put the emergency contacts from the safeguarding form in somebody's hand when
something happens to a child at the track. Its name is still to be settled
(27 Nov 2026), and so is who holds it. "Coach" below is shorthand for whoever
that is.

A prerendered section of the club app (Phase 10), beside `/registrar/`, for
the same reasons the registrar app lives there (see *One origin, one
sign-in*), with its own worker scoped to its own folder. Deferred out of
Phase 10 with the rest of this phase; Phase 10 leaves room for it in the
section switcher.

- [ ] Reached from the club app's section switcher and a card on Home that only renders for whoever holds it
- [ ] On opening: pick a session (the same session list the registrar sees)
- [ ] The session shows every child signed in
- [ ] Tapping a child opens their safeguarding information
- [ ] Phone numbers are `tel:` links, so tapping one opens the phone's call screen
- [ ] **Offline mode**: with no coverage, the coach can search every member and open their record from a cached copy

### Registrar app: missing form warning

- [ ] A warning icon on the row of any child with no safeguarding form, so the registrar can remind the child or their parent
- [ ] Hidden visually-only text for screen readers, like the balance tone words

### Ts&Cs and privacy notice

- [ ] Update the privacy notice: what's collected, why, who sees it, how long it's kept, the Article 9 condition
- [ ] Update the terms: guardians' responsibility to keep it current; coaches' and officers' obligations (as decision 8 does for registrars)
- [ ] Card payments (Phase 4, Stripe) in the same revision
- [ ] Re-acceptance: existing members accepted the old terms. Does `terms_accepted_at` need a version, so everyone is asked again?
- [ ] Committee approval, as with `committee/privacy-and-terms.md`

### Open questions

**The form**
- What it asks for. Likely candidates: emergency contacts, medical conditions, allergies, medication, GP, consent to first aid/emergency treatment, photography consent. Check Athletics NI's safeguarding requirements and any template they provide
- Does Klubfunder already collect any of this? If so, import it rather than ask twice
- Who counts as a child: under 18 by date of birth? Do adult members fill in anything (emergency contact only)?
- Does it expire, e.g. renewed each season or at Klubfunder renewal, so a stale form shows as missing?
- Are previous versions kept, or only the current one?

**Access**
- Exactly who sees what. All coaches, all children? Or coaches only for their squads, with officers seeing everyone?
- Which officers: welfare officer, child protection officer, chair? Is that a role, or a flag on a principal?
- **How roles are modelled.** Today `role` is one ladder: `member` / `registrar` / `admin` / `superuser`. With coaches the ladder stops fitting, since an admin or a member may or may not be a registrar and/or a coach. One option: keep `superuser` / `admin` / `member` as the role, with `is_registrar` and `is_coach` as booleans beside it. That touches the access-token hook (`app_role` plus new claims), every RLS policy that calls `can_run_a_session()`, `roles.ts`, the registrar app's `lib/training/registrar.ts`, the members' area cards and `/admin/households/[id]`. Decide before adding a `coach` role, so it isn't built twice
- Should viewing a record be logged, so the welfare officer can see who looked at what?

**The emergency contacts section**
- ~~Does it need to be separate from the registrar app, or a second mode of it?~~ Settled 27 Nov 2026: one club app with a section for each job (Phase 10), each offline section with its own worker
- Its name, now that it's for emergency contacts rather than coaching, and whether holding it is a coach role, a flag, or a privilege of its own
- Guests: children signed in as guests have no form. Should Add guest take an emergency contact?
- What "present" means: everyone signed in, or children only?

**Offline mode**
- The requirement means a coach's phone holds every child's safeguarding record. Is that proportionate, or is it limited to the coach's squads, or tonight's sessions?
- How long the cache lives, and whether it's wiped on sign-out or after a period unused
- What happens when a phone is lost: is revoking the login enough, given the data already on the device?
- Encryption at rest beyond the phone's own lock

**Retention**
- Deleted when a child lapses, or after a period? Probably much shorter than the two years for membership data
- Does a record from an incident need keeping longer? Incident reports themselves are out of scope for now; confirm

---

## Phase 9 — Sign in with a code

**Status: shipped 27 Nov 2026; device checks and a security review to come.** Agreed 27 Nov 2026.

The sign-in email carries a 6-digit code as well as the link, and the code can
be typed wherever the person is signing in. Both keep working: the link for
anybody reading their email on the device they're signing in on, the code for
everybody else.

**Why: the iPhone home-screen trap.** An app added to an iPhone's home screen
has its own cookies, copied from Safari once, when the icon is created. If its
session ever lapses there's no way back in from inside it, because the link in
the email opens Safari, not the app. The registrar app's signed-out screen used
to tell people to delete the icon, sign in in Safari and add it again
(`SignedOut.tsx`). A code typed into the app signs the app itself in. Android
and desktop share the browser's cookies, so the link already works there, but
the code works everywhere. It also comes before the club app (Phase 10), which
would otherwise put every member on an iPhone in the same trap.

**Six digits.** The project's *Email OTP Length* turned out to be 8 when the
first code was generated. Six was chosen on 27 Nov 2026, as easier to type,
and the dashboard changed to match. `SIGN_IN_CODE_LENGTH` in
`lib/auth/sign-in-code.ts` has to match the setting.

- [x] Supabase email template: the link and the code (`{{ .Token }}`) in the one email, the code large enough to read at a glance. The template is `supabase/templates/magic-link.html` (see *The sign-in email* in `OPERATIONS.md`), set in the dashboard on 27 Nov 2026 along with *Email OTP Length* 6
- [x] `/signin`: after the email is sent, the "check your email" screen offers a box for the code (`inputmode="numeric"`, `autocomplete="one-time-code"`), with **Send another** under it. The page verifies the code itself (`verifyOtp({ email, token, type: 'email' })`) and lands where `/signin/callback` would: terms, then the members' area (`lib/auth/after-sign-in.ts`, now shared by both)
- [x] Rules in `lib/auth/sign-in-code.ts` (what a code must look like, spaces and dashes ignored; a sentence for each refusal) and `lib/auth/sign-in-email.ts` (Turnstile, the member list, sending, moved out of `signin.astro` so the app can use them too), unit tested like everything else
- [x] Registrar app: the signed-out screen asks for the email and then the code **inside the app**, instead of the delete-and-re-add instructions. It sends the email through `POST /signin/send-email`, which runs the same checks as `/signin` (Turnstile, then the member list), and verifies the code through the browser client, so the session lands in the app's own cookies. Nothing navigates, so it never leaves `/registrar/`
- [x] The app's code screen says only *"Type the 6-digit code from the email here."* The email itself is not changed to explain this: tapping the link from a home-screen app is an iPhone problem, and the email is for everybody
- [x] **Tapping the link spends the code.** Supabase issues one token per email, and the link and the code are two ways of presenting it, so whichever is used first wins. **Supabase answers a spent code, a wrong one and an expired one with the same error** (`otp_expired`), so they can't have a sentence each. One sentence covers all three: *"That code didn't work, please check it again. If you tapped the link in the email, that invalidates the code, so press Send another below to send another."* The **Send another** button sits under it, on `/signin` as well as in the app, so nobody has to leave the app
- [x] Guessing: showing the code adds no exposure. Every magic link email already has a code behind it, and Supabase's `/verify` takes it from anyone with the public key, so a limit of our own would stop nothing: a guesser would go round it. The protection is Supabase's: 6 digits, the code's lifetime, and the per-IP token verification rate limit. All three are recorded in `OPERATIONS.md`, with the lifetime and limit still to confirm in the dashboard
- [ ] Check on an iPhone home-screen app, Android, and desktop: signing in by link and by code, and a code used after it has expired. **Done in the dev server at phone and desktop sizes** with a test login and codes from `generateLink`: a code on `/signin`, a code in the app, a spent code, a malformed one, and a non-member. Not yet on real devices, and the real email hasn't been seen, since the template isn't set
- [ ] Security review of the new path (a Phase 7 style pass). The sign-in notes in `CLAUDE.md` are updated

---

## Phase 10 — One club app

**Status: built 27 Nov 2026**; device checks to come. Agreed 27 Nov 2026.

One app called **Harriers** on the home screen for everybody, instead of one
app for each job. Members open it to see their household and training credit
(and, with Phase 4, to top up). Volunteers see the tools they hold as well:
Registration and Admin now, and Phase 8's emergency contacts later. One
install and one sign-in, however many jobs somebody does.

**Admin is a section of the app from the start.** It's the same server-drawn
pages, so in the app it needs signal just as it does in a browser. The
emergency contacts section is deferred with the rest of Phase 8.

### Decisions taken (27 Nov 2026)

- **The name under the icon is "Harriers"**, as the registrar app is today.
  It isn't tied to any one job, which suits an app that holds all of them
- **One worker per offline section, not one for the site.** The launch page
  gets a small worker of its own, and the registrar keeps the one it has,
  untouched. A worker at `/` would stand in front of every page on the site,
  public ones included, and only our own code would keep it from serving a
  stale homepage. Per section, the browser enforces the boundary. The
  manifest's scope and a worker's scope are separate settings, so the app can
  cover the whole site while each worker stays in its own folder. The cost is
  a version to bump per worker, and Registration opening offline only on a
  phone that has opened it online once, which is already true
- **Admin with no signal shows the phone's own error.** A worker under
  `/admin/` that only says "Admin needs a connection" can come later if it's
  wanted
- **The last section used is kept on the phone, indefinitely.** Local
  storage, never cleared by the app. Home on first launch and whenever
  nothing is stored

**Desktop doesn't change.** The app is the same site opened from an icon, at
the same addresses. In a desktop browser the members' area and admin are what
they are today, and the registrar stays phone-shaped.

### How you move around it

- **Each section keeps its own navigation**: admin its bottom tab bar, the
  registrar its screens and ‹ back, emergency contacts (Phase 8) whatever suits a trackside phone.
  A second bar on top of admin's would crowd the part that works best
- **One section switcher, the same everywhere**: the title at the top of a
  section's main screen ("Admin ▾", "Registration ▾") opens a sheet listing
  Home and each tool you hold, the way Slack switches workspaces. It replaces
  admin's "Your own account" in More
- **What you see depends on what you hold.** A member with no tools sees no
  switcher at all. One tool: Home and that tool. Two or three: the same sheet,
  longer. On Home each tool is also a card with a line worth reading
  ("Registration: Tuesday Seniors at 18:00 tonight", "Admin: 7 households
  overdrawn")
- **The icon opens the section you last used**, so a registrar lands on
  Registration and an admin on Admin. Home the first time
- **Opening must work with no signal.** Home and admin are drawn by the server
  and need a connection; the registrar works offline (and Phase 8's section will). So the icon
  opens a small prerendered launch page with its own worker, which sends you to
  your last section when online, and to Registration when not, rather
  than a blank screen at the track

### Work

- [x] Manifest with scope `/` and the club's icon, linked from the members' area, admin and the app's sections only, so adding a public page to the home screen stays an ordinary bookmark
- [x] Launch page (`/app/`), prerendered, with its worker: last section used, the offline rule above, Home on first launch
- [x] In the app, hide the public site's header and footer (`display-mode: standalone`, and `navigator.standalone` on iOS): their links are for visitors
- [x] The section switcher, built from what the person holds (`accessOf` in `lib/auth/roles.ts`), hidden for a member with no tools
- [x] Home: balance and household first, then a card for each tool held
- [x] An "Add it to your home screen" guide in the members' area: Share → Add to Home Screen on an iPhone (reuse the registrar's `InstallHint`), the browser's own install prompt on Android
- [x] Fold the registrar in: the switcher in its header, and the move from its own manifest to the club app's. Icons already installed keep working until they're replaced
- [x] Admin as a section: the switcher on its main screens, in place of "Your own account" in More
- [ ] Decide alongside the move from roles to privileges, since the switcher lists privileges
- [ ] Check on an iPhone and an Android phone: install from Home, open from the icon, offline launch, switching sections. Built and checked in the dev server at phone and desktop sizes, with the app simulated. Not yet on real devices. Worth checking that iOS opens `/app/` (the manifest's `start_url`) rather than the page the icon was added from; if it doesn't, the icon opens Home, which still works

### Open questions

- ~~The name under the icon~~ "Harriers"
- ~~One worker for the whole app, or one per section~~ One per section
- ~~How long "the section you last used" lasts~~ Kept on the phone indefinitely

---

## Phase 11 — Members who train free

**Status: built 27 Nov 2026.** Agreed the same day.

Some members don't pay for sessions: coaches, life members, whoever the
committee decides. Today the only way to let somebody train free is a free
session, which frees everybody in it, or an admin adjustment after every
night.

**It's a setting on the member, not the household.** Siblings in the same
household can differ: one trains free, the other pays from the household's
credit as before. It lasts until an admin turns it off, and it carries a short
reason ("Coach", "Life member") so the next committee knows why.

**A free member's sign-in is recorded and nothing is taken.** Their attendance
counts like anybody's (the Usuals, the reports, their history), but no
session debit is written, exactly as at a free session. So an untick has
nothing to give back, and the `attendance_keeps_its_money` trigger lets the
row go. Turning the setting off charges from the next sign-in; sessions
already signed into stay free, because nothing was taken for them.

**The registrar sees ∞ where the balance would be**, with no warning colour
and no cash cell, so they never ask for money. A screen reader hears "trains
free" rather than a figure.

- [x] Migration (`0025`, applied): `members.trains_free` (default false) and `members.trains_free_reason`, a reason allowed only while it's on. `sign_in_member` writes no debit for a member who trains free. The registrar app reads `trains_free` (column grant), not the reason
- [x] Rules in `lib/` (`planFreeTraining` in `people.ts`; `priceFor` in `usuals.ts` for the optimistic balance; `chargesBySignIn` in `training/history.ts`, so a member's history shows what each sign-in actually cost), unit tested
- [x] Admin: a Change on the member's page to turn it on with a reason, or off. Any admin may: it's a money decision, like the ledger forms. Shown on the member's page, and as a badge in the Members list and on the household's members
- [x] Registrar app: ∞ in place of the balance, no tone, no cash cell, "trains free" for a screen reader
- [x] The printed sheet shows ∞ for them too, with a printed key
- [x] The Klubfunder sync leaves both columns alone (it only writes the columns it names)
- [x] Checked end to end in the dev server against the live database, with ZZ test data since removed: set on the admin page (and refused without a reason), ∞ in the app, a tick that wrote attendance and no ledger row, an untick the trigger allowed, the sheet and the history

---

## Phase summary

| Phase | What ships | Key dependency |
|---|---|---|
| 0 | pnpm monorepo, Cloudflare Pages root dir flip, GitHub Actions typecheck/build CI | None |
| 1 | SSR foundation on Cloudflare Pages | Phase 0 |
| 2 | Magic link auth + Supabase members table (3-tier roles: member / admin / superuser) | Supabase project |
| 3 | Google / Microsoft OAuth | OAuth app registrations |
| 4 | Training credits, admin credit tools, member transparency view; Stripe top-up (approved 26 Nov 2026) | — |
| 5 | Training sessions, groups, guests, attendance, registrar role, sign-in PWA | Phase 4 schema |
| 6 | Admin reporting area | Phase 5 schema |
| 7 | Review — data integrity, security, privacy, then the code, then behaviour | Phase 6, and before go-live |
| 8 | Child safeguarding form, emergency contacts section of the club app (name TBC), registrar warning, Ts&Cs update | Form contents (TBC), DPIA, committee approval of terms |
| 9 | Sign in with a 6-digit code as well as the link, inside a home-screen app too (shipped; device checks to come) | Supabase email template |
| 10 | One club app, "Harriers", for everyone: Home, Registration and Admin sections, a switcher, a launch page that works offline, install guide (built; device checks to come) | Phase 9 |
| 11 | Members who train free: a member setting with a reason; sign-ins recorded, nothing charged, ∞ in the registrar app (built) | — |
