# Project notes for Claude Code

## Tooling

### `gh` CLI is scoped to this repo

This is a personal project, but `gh` is also used for work repos in other directories. To keep the two separate, this repo uses its own `gh` config dir at `./.gh/` (gitignored).

**Always invoke `gh` with the env var prefix, run from the repo root:**

```sh
GH_CONFIG_DIR="$(pwd)/.gh" gh <command>
```

(or `$(git rev-parse --show-toplevel)/.gh` if not at the root). The default `~/.config/gh` is reserved for work accounts — don't run bare `gh` in this repo, it'll either fail (no auth) or use the wrong account.

## Project management

The roadmap for the members area lives at `roadmap/members_area_implementation_plan.md` — phases are shipped independently and each one's checkboxes are ticked as they land.

## WIP feature flag

Affected nav items are marked with `data-wip` in `apps/site/src/layouts/Layout.astro`. To add a new one, just add `data-wip` to its nav link(s). The flag is build-time (`import.meta.env.DEV`) — visible in dev, hidden in prod. See README for the browser console toggle.

## Training times

Session times for the home page and the juniors page come from
`apps/site/src/data/training-schedule.ts` — periods ordered oldest-first, each with an
explicit `start` and `end`. The site shows the period covering today; once every period has
lapsed it keeps showing the most recent one and adds a note saying the times may have been
updated since. **Extend or replace the last period before its `end` date to keep that note
away.** A group with no sessions must explain itself with a `notice` (that's how "juniors
off in July" is expressed).

The `Summer 2026` style heading is derived from the current calendar season and is only a
freshness cue — it has nothing to do with which times are shown, or with the athletics
calendar.

Both pages are server-rendered (no `prerender` export) because they need the date at request
time.

`/admin/training-times` shows how the home page renders for every period in the file, plus the
stale and empty fallback states. It is a normal admin page — the middleware restricts `/admin`
to principals with role `admin` or `superuser`, so it needs no guard of its own.

`?date=YYYY-MM-DD` on `/` or `/juniors` renders those pages as of that date. Dev only, gated on
`import.meta.env.DEV` like the WIP flag.

Schedule invariants TypeScript can't express (real calendar dates, ordering, overlaps,
empty groups) are checked by `apps/site/src/lib/training/schedule.test.ts`. **CI does not run
tests**, so run `pnpm --filter @omagh/site test` after editing the schedule.

## The registrar app (`/registrar`)

The sign-in PWA is a **prerendered route on this site**, not a separate app:
`src/pages/registrar/index.astro` serving a single React island from
`src/components/registrar/`. Reached from a **Sign runners in** card in the
members' area that only renders for a registrar, admin or superuser.

**It shares the members' area session, and that is the reason it lives here.**
iOS gives a home screen web app its own cookie container, but since 17.2 copies
Safari's cookies in once, when the icon is created — and never copies
`localStorage`. A separate app persisting its session to local storage would
have to be signed into again on every phone; the site's cookie session is the
one iOS carries over. Sign in, tap the card, add to home screen: it opens
already signed in, and the sequencing needs no explaining because the card is
unreachable until you've signed in.

**The route is prerendered on purpose.** A server round trip is a blank screen at
a track with no signal, and a cached server-rendered page would be one
registrar's HTML waiting for the next. So **nothing gates `/registrar` and
nothing can** — middleware doesn't run for a static asset. That's correct, not a
gap: the shell is empty, RLS gates every read and write, and
`lib/training/registrar.ts` reads the **`app_role`** claim off the token to
decide only what gets drawn. Don't "fix" it with a middleware rule; it would buy
nothing and break opening the app offline.

Rules live in `lib/training/{registrar,tonight}.ts` and are unit tested without a
database, like everything else. The island decides nothing. It deliberately does
**not** use `Layout.astro` — every link in the site nav is outside the manifest
scope and would throw the registrar out of the app and into a browser.

**`@astrojs/react` is pinned to 4.4.x.** The 6.x line depends on Vite 8 and drags
rolldown in beside Astro 5's Vite 6; it builds, then fails the dev server with
`Missing field moduleType`. React ships on this route only — every other page
still sends no JavaScript.

**The attendance view is the screen.** `components/registrar/AttendanceView.tsx`
draws it; every decision about which rows appear is in
`lib/training/usuals.ts` and every optimistic state change is in
`lib/training/night.ts`, both unit tested without a database.

- **The Usuals are seeded from `member_groups` and learn from history.** Anyone
  ticked tonight is on the list by definition, which is how "the registrar can
  add somebody by hand" works without a second control. The history query is an
  inner join filtered on the group, so the database narrows it — not the phone
- **Frequency decides who is on the list; surname decides the order.** The plan
  once asked for both as the ordering, which cannot hold at once. Siblings
  arrive together, so they must be adjacent
- **Typing searches the whole club whichever toggle is showing.** Somebody
  typing a name has already decided the Usuals do not hold who they want
- **The tick is optimistic and so is the pot.** The row flips and the household
  balance moves before the write lands, and `night.ts` takes both back exactly if
  it fails. A row mid-flight carries a `PENDING` id and cannot be unticked —
  there is nothing to undo yet
- **Balance colour carries the warning, never the wording**: neutral in credit,
  amber below the price of a session, red overdrawn. Exactly the price is still
  credit, because it covers tonight
- **No cash cell and no guests yet**, so Money collected is not in the header.
  The headcount is, and tapping it filters to who is here — answering for the
  whole night, not just the list that happens to be open

**Writes are one per tap for now.** The coalescing window that would swallow a
mis-tap before it reaches the database belongs with the offline queue; until
then the RPC's idempotency keeps a double tap honest and an untick is a real
reversal.

**No service worker yet.** When one lands, **scope it to `/registrar`**. A
root-scoped worker would start serving stale marketing pages, which is the one
real hazard of sharing an origin with the public site.

Two platform facts the screens have to state out loud: a sign-in link tapped in
Mail opens Safari rather than the installed iOS app, so a lapsed session there is
recovered by deleting the icon and re-adding it; and Safari has no install
prompt, so iOS gets a written hint where Chrome gets `beforeinstallprompt`.

## Don't run a build while the dev server is up

`astro build` and `astro dev` share `apps/site/node_modules/.vite`. Running
`pnpm --filter @omagh/site build` while the dev server is running rewrites the
optimized-dep cache and its `browserHash`, and the dev server carries on serving
pages that reference the old hash. Every module request then 504s with **Outdated
Optimize Dep** and the page renders blank — which looks exactly like a syntax
error in whatever you last touched, and is not.

The fix is to restart the dev server. Check the hash before blaming your code:

```sh
curl -s localhost:4321/registrar | grep -o 'deps/react.js?v=[a-z0-9]*'
python3 -c "import json;print(json.load(open('apps/site/node_modules/.vite/deps/_metadata.json'))['browserHash'])"
```

Two different values is this, not you.

## Klubfunder sync

The membership data in `principals` and `members` is reconciled from a Klubfunder CSV export by `apps/site/scripts/sync-klubfunder.ts`. Run it from the repo root.

```sh
# Dry run — prints the plan, no mutations.
pnpm sync-klubfunder <path-to-csv>

# Apply — creates/updates auth users and DB rows.
pnpm sync-klubfunder <path-to-csv> --apply
```

Run the dry run first and review the plan. The plan is grouped by action:

| Action | Meaning |
|---|---|
| **Add** principal | New email in the export → create auth user + principals row |
| **Reactivate** principal | Email reappears after being lapsed → unban auth user, set `is_active=true` |
| **Update** principal | `display_name` changed (e.g. parent of record updated) |
| **Lapse** principal | Klubfunder-sourced principal whose email is no longer in the export → ban auth user, `is_active=false` |
| **Add** member | Name+DOB not seen before → insert |
| **Move** member | Same name+DOB now under a different contact email → re-point `principal_id` |
| **Reactivate** member | Was lapsed, now back in the export |
| **Update** member | `status`, `gender`, or `athletic_association_number` changed |
| **Lapse** member | Klubfunder-sourced member absent from the current export → `is_active=false`, `status='lapsed'` |

### Member identity

Members are matched on Klubfunder's own `MemberId`, not on their name. Name and
date of birth are ordinary editable fields — correcting a typo at the source is
an **Update**, not a departure and a new arrival. A member with no id yet falls
back to first name + surname + date of birth for one sync, which attaches the id;
after that the name is free to change. An export with no `MemberId` column still
works and says so in the warnings, on the old fragile terms.

The script always uses `source='klubfunder'` for the rows it creates and **never touches** rows tagged `source='manual'` (admin-added principals/members are immune from lapsing).

No emails are sent: auth users are created with `email_confirm: true`, which skips Supabase's confirmation-email step.

## Training credits

A household's balance is never stored — it is the sum of `credit_transactions`,
exposed by the `principal_balances` view. The ledger is append-only: a trigger
refuses UPDATE and DELETE outright, service-role key included, so a mistake is
corrected with a compensating row (`manual_adjustment`) rather than an edit.

A CHECK constraint ties the sign of `amount_pence` to the `type` — top-ups and
`transfer_in` must be positive, sessions, refunds and `transfer_out` negative.
Only `manual_adjustment` may go either way, which is the point of it.

Every write carries an `idempotency_key`. That is what lets the Phase 5 sign-in
PWA retry safely on leisure-centre wifi without charging anyone twice.

Member-facing wording lives in `apps/site/src/lib/credits/transactions.ts`, not
in the page — a transaction has to read as a sentence a parent can check against
their own memory ("£10.00 added — paid by cash at training, recorded by ...").
`money.ts` is the only place pounds and pence meet: admins type pounds, the app
stores pence, and a minus sign is never typed — direction is a control.

Every rule about what may be written lives in `credits/ledger.ts`, which turns a
form into rows or into one sentence for the admin. The admin pages decide
nothing, so the rules are unit tested without a database. A transfer returns
**both** rows for a single multi-row insert: one statement, so Postgres applies
both sides or neither. Two separate inserts could strand money in nobody's
account with no way to take it back.

`DEFAULT_SESSION_PRICE_PENCE` in `ledger.ts` is the £2 a session has cost for
years. It is a constant on purpose — a settings table and an admin screen would
be machinery for a change that happens once a decade. A session debit copies the
amount into the ledger row, so changing the constant never rewrites history.

Admin forms carry an `idempotency_key` minted per render. A refresh, a double
click or the back button resends the same key, the unique index refuses it, and
the admin is told it was already recorded rather than shown an error.

`/members/credits` reads the ledger with the service-role client, scoped to the
signed-in principal. That is deliberate: a line names the admin who recorded it,
and RLS rightly hides every principal row but the member's own.

## Training sessions and attendance

A training session is a row somebody created, never something derived from the
published timetable in `training-schedule.ts` — publishing the timetable and
running training are two different jobs in the club, and the schema keeps them
apart. A session copies the £2 price into `price_pence` at creation, so changing
the constant never rewrites a session that has already run.

`attendance` is one row per runner per session, member or guest, never both — a
CHECK enforces the exclusive-or. Uniqueness is `(member_id, session_id)`, not
`(member_id, date)`: a member can legitimately train twice in a day. Only a
guest's row carries `amount_paid_pence`; a member's £2 comes out of the
household pot and so lives in `credit_transactions` instead.

Unlike the ledger, **attendance is not append-only** — unticking somebody
removes the row. There is deliberately no UPDATE policy on it.

That is why `credit_transactions` has **no `attendance_id`**, despite the plan
once asking for one: a foreign key to `attendance` is a RESTRICT reference
pinning the row the untick has to delete, and `ON DELETE SET NULL` is refused by
the append-only trigger. A session debit is found through
`(member_id, session_id)` instead, and is keyed `session:{attendance_id}` so
that a re-tick after an untick is a new charge rather than a key the unique
index silently swallows.

**A tick is two rows in two tables, so it goes through an RPC.** PostgREST
cannot span `attendance` and `credit_transactions` in one statement, and a phone
on leisure-centre wifi that managed only one of them would leave a runner
present and uncharged, or charged and absent. `public.sign_in_member(member,
session [, attendance_id])` writes both in one transaction and returns the
attendance id; `public.undo_member_sign_in(attendance_id)` deletes the row and
gives the money back. Both are in migration `0011`.

They are **SECURITY INVOKER** on purpose. RLS already says who may write what,
and a definer function would restate that rule and then be where it goes stale.
The role check at the top of each only turns a silent RLS denial into a sentence.

Every insert is `ON CONFLICT DO NOTHING`, untargeted, because a retry could trip
either the unique `idempotency_key` or the unique `(member_id, session_id)`.
CHECK violations still raise — a malformed row is a bug, not a retry. A repeated
tick returns the attendance row that is already there and writes no second
charge; a repeated untick credits once; a re-tick after an untick mints a fresh
attendance id and so correctly charges again.

**A role guard writes `IS NOT TRUE`, never `NOT`.** `current_app_role()` is NULL
for a token carrying no `app_role` claim, so `can_run_a_session()` is NULL, and
`NOT NULL` is NULL rather than true — an `IF NOT ...` guard silently does not
fire and execution falls through. `0011` had this and `0013` fixed it. RLS was
never fooled (its policies refuse a NULL just as firmly), but the function's own
guard did nothing. Copy the `IS NOT TRUE` form into anything new.

**A guest never goes through these.** Their cash lives on the attendance row, so
ticking and unticking a guest is a single-table write through PostgREST.
`undo_member_sign_in` refuses one with a sentence saying so.

**A free session is attendance and nothing else** (`price_pence = 0`, allowed
since `0012`). `credit_transactions` is `CHECK (amount_pence <> 0)`, so a zero
debit cannot be written whatever anybody decides — which is why `sign_in_member`
branches on the price rather than inserting the pair unconditionally. Nothing was
taken, so an untick gives nothing back. A guest at a free session has
`amount_paid_pence` NULL, not 0.

`groups` are the squads the club trains in, and `member_groups` is what makes
the registrar's Usuals list useful before any attendance history exists.
Retiring a group is `is_active = false`; nothing is ever deleted.

## Admin session management

Four screens, and between them they make the Phase 5 schema usable: `/admin/groups`
(add, rename, retire), `/admin/groups/[id]` (who trains with a squad),
`/admin/sessions` (list and create) and `/admin/sessions/[id]` (edit, cancel, and
what the night came to).

Every rule they obey lives in `src/lib/training/` and is unit tested without a
database, the way `credits/ledger.ts` is: `groups.ts`, `sessions.ts`,
`session-cash.ts`, `names.ts`, `club-time.ts`. A page hands over a form and gets
back either a row to write or one sentence to show the admin.

- **Group names are checked more strictly than the database checks them.** The index
  is on `lower(name)`, so "Middle Distance" and "Middle-Distance" could both exist.
  `normaliseForSearch` folds case, whitespace, apostrophes, hyphens and accents, and
  the second one is refused with a sentence naming the first. A registrar picking from
  a list cannot tell those apart
- **A session's price is set from `DEFAULT_SESSION_PRICE_PENCE` at creation and the
  session keeps its own copy.** Once anybody has signed in, the price field disables
  itself: each sign-in put a debit in the append-only ledger at that figure, and a new
  one here would contradict it. Name and location stay editable. Cancelling is
  `is_cancelled = true`
- **Retiring a group and cancelling a session are both soft.** The sessions and the
  attendance behind them have to keep meaning something years later
- **Money collected is `top_up_cash` plus `refund` rows carrying the `session_id`,
  plus `amount_paid_pence` on the session's guest attendance.** Session debits are
  excluded — they move credit out of a household's pot rather than money into the tin.
  Grouping by who recorded each entry is the figure that matters when two phones were
  open, and it only appears on screen when more than one person recorded something
- **A member's charge is found through `(member_id, session_id)`**, which is the join
  that stands in for the foreign key the schema deliberately does without
- **`training/names.ts` is shared with the browser.** The member-assignment filter
  imports it from the page's `<script>`, so what the admin screen matches and what
  the registrar app will match cannot drift apart
- **`training/club-time.ts` reads a typed time as Omagh's clock, not the Worker's.**
  A `datetime-local` of `19:00` on a July evening is 18:00 UTC; storing it as 19:00Z
  would put every screen an hour out of step with the people on the track

## Roles

`member`, `registrar`, `admin`, `superuser`. Who may hand out which role lives in
`src/lib/auth/roles.ts`; the screen is `/admin/principals/[id]`, which has always
been superuser-only. A superuser cannot change their own role there — it would lock
them out of the only screen that could put it back.

A registrar is a volunteer with a
borrowed phone: they read the whole club — every principal, member and ledger
row, because a household balance beside a name is the sum of that ledger and the
sign-in app holds no service-role key — and they write only the night's
sessions, attendance, guests and cash. They cannot edit a member, change a role,
rename a group or re-price a session.

RLS gates on the **`app_role`** JWT claim, never `role`. PostgREST reserves
`role` for the PostgreSQL session role, which is why `0004` moved it. `0008`
was written against the old name and so never matched anybody; `0010` repairs
it. Phase 4 didn't notice because its admin pages use the service-role client,
which bypasses RLS entirely — if a page reads the ledger with the anon key,
check the claim name first.

## Members area layout

Every signed-in page frames itself with `apps/site/src/components/PageContainer.astro`
rather than its own `max-w-* mx-auto` div, so the gutters line up with the nav and
footer and the page doesn't resize as you click around. One width throughout, which
is the default; `width="form"` narrows the sign-in card, and nothing else should need
to ask. `/admin/training-times` is the exception — it mirrors the public home page, so
it keeps that page's own full-width container.

## Sign-in flow

`/signin` asks for the membership email first, checks it against `principals`, then
offers only what that address can actually use — Google for Gmail, Microsoft for
Outlook and friends (`apps/site/src/lib/auth/oauth-providers.ts`), with an email
link always available. Nobody is shown three buttons when they only have one.

The entered address is kept in a short-lived httpOnly cookie across the OAuth
round trip. `/signin/callback` refuses the sign-in if the provider returns a
different address, which is what happens when a member's Klubfunder email is a
secondary alias on their Microsoft account. Without that check they are quietly
signed in as whichever principal owns the primary address.

## Microsoft sign-in expiry

Azure caps an OAuth client secret at 24 months, and when it lapses Microsoft
sign-in breaks for every member at once. The button withdraws itself on the date
in `apps/site/src/lib/auth/microsoft-oauth.ts` rather than failing in the
member's face — magic link and Google carry on regardless.

**Renewing the secret in Azure means moving that date to match**, otherwise the
button stays hidden. Deleting the constant is the way to retire Microsoft
sign-in for good.
