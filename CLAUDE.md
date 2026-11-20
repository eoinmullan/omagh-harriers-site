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

**The look is the prototype's, deliberately.** `prototype/registrar-screen`
settled what the screen is; it also settled how it looks, and the built screen
matches it: black ground, the club's **amber** as the only accent, Tailwind's
neutrals for everything else.

- **The surname is bold and upper-case, the first name is not.** Finding one
  name among three hundred is the job, so the half being scanned for is the half
  that carries the weight
- **Rows are a hairline-separated list, not a stack of cards** — more names on a
  phone, and it reads as one thing to run a finger down. 76px rows, a 36px
  checkbox, a 72px cash cell
- **The cash cell has two lines**: the figure in amber, then a small upper-case
  *added* (member) or *paid* (guest), so it explains itself without a legend
- **Round amounts drop their pence.** `credits/cash-label.ts` — "£10", not
  "£10.00", which is how money is spoken at a gate. Balances keep their pence,
  because a balance is a statement figure rather than a handful of notes
- **The header figures carry a ▾**, because they are filters and nothing else
  would say so

- **The search box appears only on the full list**, and hides while either
  header filter is on. The Usuals are short enough to read, and a filter has
  already narrowed the night to an answer. Switching tab or turning a filter on
  clears the term, so a search can never go on filtering a list that no longer
  shows the box

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
- **The headcount and Money collected are both filters**, and tapping either
  clears the other. Both answer for the whole night, not just the list that
  happens to be open — otherwise the number would describe people the registrar
  cannot see

**A registrar can start a session at the track.** `lib/training/track-session.ts`
and `components/registrar/StartSession.tsx`. Spond makes an admin create every
session in advance; this does not copy that.

- **The id is minted on the phone**, so the session can be started with no
  signal and ticked into immediately. The write queues like any other and the
  queue is strictly FIFO, which matters here more than anywhere:
  `attendance.session_id` is a RESTRICT reference, so an attendance row that
  reached Postgres before its session would be refused
- **It is named after the group and starts now.** A registrar cannot rename or
  re-price a session afterwards, so offering a text box would be offering
  something the app cannot keep
- **The control sits under tonight's list, never in place of it.** A registrar
  who cannot see what is already running starts a second Endurance beside the
  one the other phone opened, and the evening ends up in two halves
- **A near-duplicate warns and names what is already on, with a tap to open it —
  it does not refuse.** The schema deliberately lets a group train twice in a
  day, and the person holding the phone is the one who can see the track

**Guests are a third list, not a third filter.** `lib/training/guests.ts` holds
the rules; `components/registrar/{GuestRow,AddGuest}.tsx` draw them.

- **A guest's row carries no money control.** Ticking them in takes the session
  price and that is the whole transaction — they hold no credit to add to. The
  figure beside the name states what they paid and cannot be edited
- **Their cash lives on the attendance row**, not the ledger, so unticking
  deletes the row and takes the money with it. Safe only because attendance is
  not append-only; the ledger is
- **A free session records `amount_paid_pence` NULL, not 0** — the column is
  checked `> 0`, so a zero is refused where an absent figure is fine
- **A repeated name is never refused.** The table has no uniqueness on names on
  purpose, because two genuine Jack Kellys would collide and a constraint
  violation in front of a queue is the failure this phase exists to avoid.
  `likelyAlready` offers whoever is already on file before Add is reached, and
  the button then reads "Add anyway"
- **Money collected has two halves**: `top_up_cash` less `refund` from the
  ledger, **plus** `amount_paid_pence` on the session's guest rows. Leaving the
  guest half out under-reports the tin, which is a bug I shipped and the browser
  caught. `session-cash.ts` computes the same figure for the admin screen and
  the two must keep agreeing

**Every write goes through a queue**, in `lib/training/queue.ts` (rules),
`queue-store.ts` (IndexedDB) and `queue-sender.ts` (the calls), driven by
`components/registrar/useWriteQueue.ts`.

- **A tap is held for two seconds before it is sent.** A tick and its own untick
  inside that window cancel each other and the database never hears about
  either — a mis-tap should not leave a charge and a compensating adjustment on
  a member's statement for something that never happened. Once a write has left,
  the untick is a real reversal. That is the difference between this and an undo
  button
- **The attendance row's id is minted at tick time, not by Postgres**, which is
  what lets an untick name the row it reverses while that row is still only a
  promise in the queue. `sign_in_member` takes it as `p_attendance_id`
- **Cash is never coalesced.** Each entry is a difference from the figure that
  was on screen when it was made, so dropping one silently changes what the
  others mean
- **Retry forever on a dropped connection; give up on a refusal.** Abandoning a
  sign-in because a leisure centre's wifi blinked is how somebody ends up
  unrecorded; retrying a Postgres refusal just hides the bug until the end of
  the night. A refusal reloads the list, because the screen is then wrong and
  guessing which optimistic change to unpick is worse than asking the database
- **Money collected says when it is only this phone's view** — pending count
  while sending, and an amber line when offline. Under the figure, not in its
  label, so the common case reads plainly
- **One outbox for the phone, not one per screen.** Mounted at the island root,
  so a tick owed for Monday's session keeps being retried while the registrar
  is on the picker or in another session. A queued write names its own author;
  nothing is resolved at send time that could be resolved at tap time
- **The screen catches up when a restored backlog clears.** A queue loaded from
  storage lands after the view has already loaded, so the database has moved
  and the view cannot know. Reloading after every tap would be a round trip per
  tick, and the optimistic state is already right in that case
- **The other phone is polled, not subscribed to** — every twenty seconds and
  on regaining focus, and only when this phone owes nothing, has no sheet open
  and is on screen. `lib/training/watching.ts` holds that rule and the reason
  for choosing a poll over Realtime
- **Adding a guest is the one write that cannot be queued**: the rest of the
  night needs the id Postgres gives back. Offline, the registrar is told to take
  the name on paper

**The service worker lets the app be opened with no signal at all**, which the
queue cannot do on its own. `public/registrar/sw.js`, registered by
`useServiceWorker.ts` from inside the island.

**It is served from `/registrar/` on purpose, and must stay there.** The one
real hazard of sharing an origin with the public site is a worker that starts
answering for the marketing pages, and a stale homepage served to the public is
a worse failure than the one this solves. Two things prevent it: a worker
cannot claim a scope above its own directory, so `/registrar/` is a ceiling the
browser enforces; and a worker only sees requests from pages inside its scope,
so marketing requests never reach the code. **Do not move the file up a
directory and do not add a `Service-Worker-Allowed` header to widen it.** It is
registered from the island rather than `Layout.astro` for the same reason —
every other page on this origin is public.

That is also why the app is canonically **`/registrar/` with the trailing
slash**: a worker at `/registrar/sw.js` tops out at scope `/registrar/`, which
does not cover a bare `/registrar`. The manifest's `start_url` and `scope` and
the members' area card all use the slash.

Navigations are network-first so a deploy lands the moment there is signal, with
the cached shell as the fallback. Hashed `/_astro/` assets are cache-first,
because the hash *is* the version. **Cross-origin requests are never touched** —
caching a Supabase read would mean showing last week's balances as tonight's.
There is no `skipWaiting()`: a new version waits rather than swapping assets
under a registrar mid-session.

**Reads are cached too**, in `lib/training/snapshot.ts` over the shared
`idb.ts`. Two snapshots: tonight's session list, keyed by Omagh's day, and the
night's data, keyed by session. The picker fails before the attendance view is
ever reached, so caching only the latter would never be seen.

**The snapshot is taken on every change the registrar sees, not on a successful
load.** A tick made offline is part of what this phone believes even though the
write is still queued, and a registrar who closes the app and opens it again
two minutes later must see the screen they left. The queue replays the writes
separately and every one is idempotent, so a write already reflected in the
snapshot lands harmlessly.

A screen restored from a snapshot says so in amber, naming the time it was
taken rather than an age — "4 minutes ago" goes stale while it is being read.
Coming back online reloads rather than leaving the registrar on a stale screen.

Two platform facts the screens have to state out loud: a sign-in link tapped in
Mail opens Safari rather than the installed iOS app, so a lapsed session there is
recovered by deleting the icon and re-adding it; and Safari has no install
prompt, so iOS gets a written hint where Chrome gets `beforeinstallprompt`.

## The paper fallback

`/admin/sessions/[id]/sheet` prints the night: the session's Usuals ordered by
surname, a tick box, each household's credit so the registrar knows who needs
asking, a column to write cash in, and spare lines for whoever turns up who is
not on the list.

It is an **admin** page on purpose. Printing happens sitting down — before the
night, or from somebody else's laptop once a phone has already gone — and a
registrar standing at a track with a dead phone is not printing anything.

Black on white with its own `@media print` rules, no site chrome, rows that do
not break across pages and a header that repeats. The on-screen note says the
thing that matters: **paper is the fallback, not the record.** Whatever is
written on it still has to be entered in the app afterwards, or the ledger
never hears about the night.

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

**The ledger holds ids, never names.** It is append-only, so a name written into
`notes` would be there for good, and no erasure request or anonymisation could
reach it. A transfer records the other household as `counterparty_principal_id`,
and a CHECK requires it on every transfer and forbids it on everything else. The
untick's note names the squad, and `member_id` names the runner.
`credits/transactions.ts` turns those ids into names when a statement is read, so
anonymising a household or a member reaches every line that mentions them. A
member's own statement doesn't join the counterparty and says "another account"
instead of naming somebody else's household. The admin statement names it.
`notes` holds only what an admin typed, and **nothing the code writes there
should ever contain a person's name.** Migration `0017`.

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

**A session has no name and no location — it is a squad and a time.** Both
columns were drawn into the schema before anything used them and neither earned
its place: the registrar app named a session after its own group, and the one
session created by hand was called "Wed", which says less than the start time
already does. `groups.name` is the label everywhere now, and the untick's ledger
note names the squad and no one else: *"Middle Distance sign-in corrected"*. The
statement adds *"for Jack Kelly"* from the row's `member_id` (see "The ledger
holds ids, never names" above).

`note` replaces both. One optional free line, null on almost every session,
covering what `location` was reaching for ("top car park") and the things it
never could ("juniors only", "coaches away, easy run"). It shows on the session
picker, on the admin screens and on the printed sheet. Migration `0014`.

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

**The untick reads the charge it is reversing**, rather than rebuilding it from
the member's household and the session's price as those stand today. Both can
have moved: the Klubfunder sync re-points `members.principal_id` when a member
changes household and rightly leaves the ledger with the household that paid, so
reading the member's current household credited the wrong pot — the payer stayed
down and somebody else went up. The amount and the `principal_id` now come off
the row keyed `session:{attendance_id}`, which the function had to find anyway to
know whether anything was taken. A NULL there means nothing was, which covers a
free session and a tick whose charge never landed. Migration `0015`.

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

## The admin area

`/admin` is an **area**, not a corner of somebody's members' page, and
`src/layouts/AdminLayout.astro` is what makes it one. Every admin screen used to
breadcrumb back to "Members' area", which said two untrue things: that squads
live inside your personal account, and that the way from squads to households is
out and back in again. An admin doing three jobs went past their own balance
three times.

A page hands the layout a `section` (which tab is open), a `title`, an optional
`breadcrumb` rooted inside the area, and `wide` for the one page that mirrors the
public home page. The layout draws the section nav; the only link that leaves is
the one that says it leaves — **Your own account →**. The members' area offers
one door in reply, a single **Club admin** card, rather than five links into the
deep end.

`/admin` redirects to `/admin/sessions`. **There is no dashboard on purpose** —
the first screen is the job that actually recurs, not a page of figures standing
between an admin and it.

**Squads and Households are the club's words; `groups` and `principals` are
Postgres's.** The routes and every label say squad and household; the tables,
columns, RLS policies and `lib/training/groups.ts` still say group and principal,
and should. Renaming a schema to match a vocabulary is a migration that buys
nothing, but an admin screen that says "Principals" is asking a volunteer to
learn the schema.

**The middleware gates on `pathname.startsWith('/admin')`**, so a future route
called `/admin-anything` is gated too, whether or not that was intended. Worth
knowing before naming one.

**Credit is not a section — a household is.** There used to be six sections, and
two of them were the same 220 rows listed twice with different columns, with a
detail page each: one held a household's name, email, role and members, the
other held its balance, statement and the forms that write to the ledger. An
admin asked "has Jack Kelly's mum paid?" found the money on one screen and the
email to chase her on the other. A household has a name, the people in it, a
role and a balance, and that is one thing somebody holds in their head.

So `/admin/households/[id]` carries both halves — identity and role, then
members, then **Training credit**: the balance, the four ledger forms and the
statement, under an anchor so the balance in the header can point down at it.
The balance is a column on the Households list, sortable by one click because
who owes money is the question that column exists to answer, and the Club float
and Overdrawn figures came across with it.

**Nothing about the ledger moved.** `credits/ledger.ts`, `money.ts` and
`transactions.ts` are untouched: the page still hands a form over and gets back
either rows to insert or one sentence, and the per-render `idempotency_key` still
means a refresh or a double click resends the same key for the unique index to
refuse. What the move did add is one guard — the identity actions are
superuser-only and the ledger actions are not, so they are told apart by name
before either runs.

`/admin/credits` and `/admin/credits/[id]` survive as **301s** to the household
and to its `#credit` anchor. They are two frontmatter-only files rather than
deletions, because the club has been using those URLs since Phase 4 and a
bookmark should not 404 to prove a point.

## Admin session management

Four screens, and between them they make the Phase 5 schema usable: `/admin/squads`
(add, rename, retire), `/admin/squads/[id]` (who trains with a squad),
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
`src/lib/auth/roles.ts`; the screen is `/admin/households/[id]`, which has always
been superuser-only. A superuser cannot change their own role there — it would lock
them out of the only screen that could put it back.

**That gate is the UI's, and the database now refuses to take anyone's word for
it a second way.** `principals` and `members` have no anon-key INSERT or UPDATE
policy at all: every admin write goes through the service-role client, which
bypasses RLS, so the policies were unused — and while they existed, an admin
holding an ordinary anon-key session could PATCH their own `role` to `superuser`
directly, because an RLS policy checks the actor's claim and cannot see which
column is changing. Migration `0016` dropped them. A member reads their own
household and a registrar reads the club through SELECT policies that remain; if
some later phase needs an admin to write these tables on the anon key, the `role`
column wants a `SECURITY DEFINER` RPC or a `BEFORE UPDATE` trigger that checks for
superuser, never a blanket policy.

A registrar is a volunteer with a
borrowed phone: they read the whole club — every principal, member and ledger
row, because a household balance beside a name is the sum of that ledger and the
sign-in app holds no service-role key — and they write only the night's
sessions, attendance, guests and cash. They cannot edit a member, change a role,
rename a group or re-price a session.

**A login reads columns, not rows.** RLS decides which rows; column privileges
decide which columns, for every login alike. Through anything but the service
role, `principals` exposes only `id, auth_user_id, display_name, role,
is_active, terms_accepted_at`, and `members` only `id, principal_id,
first_name, surname, is_active`. A registrar can read every name in the club
and no date of birth, gender, Athletics NI number or email. A page that needs a
hidden column reads it with the service role, scoped to the signed-in
principal; `members/index.astro` does this for a member's own children.
**Adding a column the registrar app or middleware reads means adding it to
the grant in a migration**, or the query fails with `42501`. A
`GRANT SELECT ON ALL TABLES` would quietly hand back whole rows. Migration
`0018`.

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
