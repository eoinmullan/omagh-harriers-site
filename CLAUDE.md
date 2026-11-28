# Project notes for Claude Code

## Working in this repo

One app, `apps/site` (`@omagh/site`): the public website, the members' area,
the admin area and the registrar app, all one Astro 5 SSR deployment on
Cloudflare Pages, backed by one Supabase project. `README.md` has the commands
and the map; this file has the decisions.

- **Rules live in `src/lib/`, pages and the island decide nothing.** A page
  hands a form to a lib function and gets back rows to write or one sentence
  to show. Each module has a `*.test.ts` beside it (Vitest, Arrange/Act/Assert,
  no comments), run without a database. Keep new rules there
- **Check before pushing**: `pnpm --filter @omagh/site typecheck` and
  `pnpm --filter @omagh/site test`. Pages runs both before building, so a
  failure there keeps the last deployment live rather than shipping
- **A push to `main` deploys.** Work lands by fast-forwarding `main`; there
  are no long-lived branches
- **Schema changes are numbered migrations** in `supabase/migrations/`,
  applied with the Supabase CLI before the code that needs them is pushed
  (see *Applying a migration* in `OPERATIONS.md`), then
  `pnpm --filter @omagh/site supabase:types` and `astro check` (see
  *Database types* below)
- **Verify in the browser.** `.claude/launch.json` has the dev server
  (`localhost:4321`). Check every change at phone size (375 × 812) as well as
  desktop: see *Mobile is first-class* below. Test data in the live database
  is fine before go-live; it is
  cleared with `supabase/scripts/clear-training-data.sql`
- **Reviews are in `roadmap/reviews/`**, one file per review, findings
  numbered, with what was done about each

## Mobile is first-class

Many people use the site only on a phone: registrars at the track, admins
between jobs, and members checking their training credit (and, with Phase 4,
topping it up). **Every screen must be fully usable at 375 × 812, at least as
well as on desktop.** That covers the members' area and the admin area, not
just the registrar app. A change isn't done until it has been looked at on both.

- **No sideways page scroll.** Long values (emails, names, notes) wrap or
  truncate; nothing makes the page wider than the screen
- **Inputs are 16px or larger**, or iOS zooms the page when one is focused
- **Tap targets are at least 44px tall**, and nothing depends on hover
- **Lists are lists on a phone**, not tables to scroll sideways: the name, one
  line of detail, and the figure that matters on the right
- **Dialogs fit the screen**, with their buttons in reach

## Tooling

### `gh` CLI is scoped to this repo

This is a personal project, but `gh` is also used for work repos in other directories. To keep the two separate, this repo uses its own `gh` config dir at `./.gh/` (gitignored).

**Always invoke `gh` with the env var prefix, run from the repo root:**

```sh
GH_CONFIG_DIR="$(pwd)/.gh" gh <command>
```

(or `$(git rev-parse --show-toplevel)/.gh` if not at the root). The default `~/.config/gh` is reserved for work accounts — don't run bare `gh` in this repo, it'll either fail (no auth) or use the wrong account.

## Operations

**`OPERATIONS.md` holds everything that isn't in the code**: every Supabase and
Cloudflare dashboard setting the site depends on (there's no
`supabase/config.toml`), what to do when a training night goes wrong, the
one-click Cloudflare rollback, and how to renew the Microsoft secret. Change a
dashboard setting, change that file.

## Project management

The roadmap for the members area lives at `roadmap/members_area_implementation_plan.md` — phases are shipped independently and each one's checkboxes are ticked as they land.

## WIP feature flag

Affected nav items are marked with `data-wip` in `apps/site/src/layouts/Layout.astro`. To add a new one, just add `data-wip` to its nav link(s). The flag is build-time (`import.meta.env.DEV`) — visible in dev, hidden in prod. See README for the browser console toggle.

## Training times

Session times for the home page, the juniors page, the About page and
`/upcoming-training-times` come from
`apps/site/src/data/training-schedule.ts` — periods ordered oldest-first, each with an
explicit `start` and `end`. The site shows the period covering today; once every period has
lapsed it keeps showing the most recent one and adds a note saying the times may have been
updated since. **Extend or replace the last period before its `end` date to keep that note
away.** A group with no sessions must explain itself with a `notice` (that's how "juniors
off in July" is expressed).

The `Summer 2026` style heading is derived from the current calendar season and is only a
freshness cue — it has nothing to do with which times are shown, or with the athletics
calendar.

All four are server-rendered (no `prerender` export) because they need the date at request
time, and cached for five minutes. **Don't hardcode a time on any page**: the About page
had its own copy, and it still said 6:30pm a month after training moved to 6:45pm. The
About page's fact tiles show no session count for that reason: a number derived from the
schedule was one more thing to explain when a period had no senior sessions.

`/admin/training-times` shows how the home page renders for every period in the file, plus the
stale and empty fallback states. It is a normal admin page — the middleware restricts `/admin`
to principals with role `admin` or `superuser`, so it needs no guard of its own.

`?date=YYYY-MM-DD` on any of them renders the page as of that date. Dev only, gated on
`import.meta.env.DEV` like the WIP flag.

Schedule invariants TypeScript can't express (real calendar dates, ordering, overlaps,
empty groups) are checked by `apps/site/src/lib/training/schedule.test.ts`. CI runs the
tests (`pnpm -r test`) on every push to `main` and every pull request, but run
`pnpm --filter @omagh/site test` before pushing anyway: a fast-forward to `main` is checked
only after it has landed.

## The club app, "Harriers"

One app on the home screen for everybody (Phase 10). It's the same site opened
from an icon, at the same addresses: **Home** (`/members`), **Registration**
(`/registrar/`) and **Admin** (`/admin`), as a person's role allows
(`lib/app/sections.ts`). Desktop browsers see the site as it always was.

- **Only the app's pages link its manifest**, `public/app/manifest.webmanifest`
  (scope `/`, start `/app/`). `Layout.astro` links it on a signed-in page under
  `/members` or `/admin`, and the registrar links it itself. Adding a public
  page to the home screen stays an ordinary bookmark
- **The icon opens `/app/`**, a prerendered launch page with its own worker. It
  sends the person to the section they used last, kept on the phone for good,
  or Home the first time. With no signal it sends a registrar to Registration,
  the one section that opens offline, and tells anybody else Home and Admin
  need a connection (`lib/app/launch.ts`). It checks for signal by fetching
  something small, because `navigator.onLine` says yes on a phone with bars
  and no data
- **One worker per offline section, never one for the site.** `/app/sw.js`
  covers only the launch page and `/registrar/sw.js` only the registrar. A
  worker at `/` would stand in front of the public pages, and only our own
  code would keep it from serving a stale homepage. The manifest's scope and a
  worker's scope are separate settings, so the app covers the site while each
  worker stays in its folder
- **Inside the app the public nav and footer are hidden.** `Layout.astro` marks
  the page `in-app` before it paints (`display-mode: standalone`, or
  `navigator.standalone` on iOS), and `.app-only` / `.browser-only` in
  `global.css` do the rest. Their links are for visitors, and an iPhone
  home-screen app has no back button, so the logo leads Home instead
- **The section switcher** is the section's name in the header ("Admin ▾"),
  opening a sheet of Home and each tool held. It replaces admin's "Your own
  account", and shows only in the app and only to somebody with a tool.
  `components/app/SectionSwitcher.astro` draws it for the server pages,
  `components/registrar/SectionSwitcher.tsx` on the registrar's today list
- **Home's tool cards are for the browser only.** In the app the switcher
  already lists the tools, so the cards would say it twice. In a browser each
  says something (`lib/app/home-cards.ts`): today's sessions for Registration,
  how many households are overdrawn for Admin. Home offers
  to install the app on a phone (`lib/app/install.ts`), Share → Add to Home
  Screen on an iPhone, the browser's own prompt elsewhere
- **The registrar's old manifest stays** (`public/registrar/manifest-v2.webmanifest`)
  for the icons already installed from it. They keep working, scoped to
  `/registrar/`, until they're replaced

## The registrar app (`/registrar`)

The sign-in PWA is a **prerendered route on this site**, not a separate app:
`src/pages/registrar/index.astro` serving a single React island from
`src/components/registrar/`. The club app's Registration section, reached
from the switcher or a **Registration** card on Home that only renders for a
registrar, admin or superuser.

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

**No role in the token is a broken hook, not a member.** The access-token hook
writes `app_role` (`member`, or `none` for a login with no household), so a token
with no `app_role` at all means the hook isn't running. `roleClaimIsMissing`
tells the two apart, and the app shows *"Club roles aren't reaching this app"*,
with paper as tonight's fallback and the setting to fix, instead of telling a
real registrar they're only a member.

Rules live in `lib/training/{registrar,tonight}.ts` and are unit tested without a
database, like everything else. The island decides nothing. It deliberately does
**not** use `Layout.astro` — the site nav's links are for visitors, and would
turn the app into a browser.

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
- **Every sibling's row shows the household's cash as "£10 added"**, on
  purpose. Cash belongs to the household and records no member, so the app
  can't say which sibling handed it over. "For both" was tried and read as if
  it covered a non-running parent. Registrars are told what it means instead
- **Except on Paid, which lists households, not runners**: one row per
  household that paid, saying who from it is signed in, plus a row per guest
  who paid. Paid is the view the tin is checked against, so its rows add up to
  its header; listing every member repeated each household's figure, and a
  £60 night added up to £115 (`householdsThatPaid` in `usuals.ts`)
- **The way back is a ‹ at the top left of the header**, always in reach. An
  iPhone home-screen app has no back button, and a Done at the foot of the
  list was under 313 names on Everyone. A Done still ends the page, for a short
  list. The header is the squad on the first line, then the time (or date and
  time) with the save indicator right-aligned beside it
- **Back and forward behave as in a native app.** Each screen past today's
  list is a history entry (`AsHistoryEntry` in `SessionPicker.tsx`), so back
  steps out and **forward goes back in**: the picker remembers every session
  it has opened. The cash sheet and the squad picker are **layers**
  (`useHistoryLayer`): back closes them rather than leaving the screen
  beneath, and closing them any other way steps over their own entry, so no
  back press is ever spent doing nothing. A session opened from the squad
  picker takes over the picker's entry. After a reload the app reopens the
  session its history entry names, if it's today's. The five views are not
  history, for the same reason tabs in a native app aren't
- **Back never leaves the app for the website** (`useStayInTheApp`). Opened
  from its icon the app is first in its window's history, so back from
  today's list closes it. But it can start with website pages behind it:
  tapped from the members' area in a browser. So
  when it starts on today's list with history behind it, the entry it
  arrived on becomes a guard under today's list, and back from today lands on
  the guard and steps forward again. With nothing behind, there's no guard
- **The header's figures are all about tonight**: Usuals, tonight's guests,
  signed in, paid. Everyone shows a search glyph rather than the size of the
  club
- **A runner's line leaves the household's name off when the runner is the
  household's contact** (`householdNameToShow`), rather than saying their own
  name twice
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

- **The Usuals are a squad's members, its recent regulars, and tonight.**
  Members are `member_groups`, set on `/admin/squads/[id]`, and stay on the
  list for good. Regulars come from the `squad_regulars` view (migration
  `0024`): anyone who has trained with the squad in the last eight weeks, once
  each, with how often and when they last came. They drop off eight weeks
  after they stop coming. Anyone ticked tonight is on the list by definition,
  which is how "the registrar can add somebody by hand" works without a second
  control. The view is sized by membership, not history, so it never meets
  PostgREST's row limit, and the window lives only in the view, so the
  registrar's list and the admin page can't disagree
- **A squad's page offers its regulars for promotion.** "Trained here
  recently" lists who has been coming without being a member, most frequent
  first, each with an **Add to squad** button, and the full list notes each
  regular's attendance beside their tick box (`regularsToPromote` and
  `describeRegular` in `groups.ts`)
- **Surname decides the order, and frequency plays no part in it.** The plan
  once asked for frequency as the ordering, but siblings arrive together, so
  they must be adjacent
- **Typing searches the whole club whichever toggle is showing.** Somebody
  typing a name has already decided the Usuals do not hold who they want
- **The tick is optimistic and so is the pot.** The row flips and the household
  balance moves before the write lands, and `night.ts` takes both back exactly if
  it fails. A row mid-flight carries a `PENDING` id and cannot be unticked —
  there is nothing to undo yet
- **Balance colour carries the warning, never the wording**: neutral in credit,
  amber below the price of a session, red overdrawn. Exactly the price is still
  credit, because it covers tonight. **That's for the eye only.** A row's
  `aria-label` is just the runner's name, and a label replaces the button's
  contents, so the balance line is attached as its `aria-describedby`, with a
  visually hidden tone word from `toneWords()` (*"won't cover tonight"*,
  *"overdrawn"*). A screen reader hears the balance, the household and the
  warning, and the screen is unchanged
- **The cash sheet behaves as a modal dialog**: opening it focuses the first
  amount, Tab stays inside, Escape closes it like Cancel, and closing returns
  focus to the cash cell that opened it
- **Small text stays at `neutral-400` or lighter on black.** `neutral-500` and
  `neutral-600` fail AA contrast at these sizes. The empty cash cell's "+ £"
  was 2.69:1, and it's the only cue that the cell can be tapped
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
- **A squad that's already on today says so in the squad list, and opens that
  session** ("On at 08:42 — open it"), because the usual reason to look for it
  there is that the other phone started it. It doesn't refuse a second one:
  "Start another Middle Distance" is a smaller link underneath. The schema
  deliberately lets a group train twice in a day, and the person holding the
  phone is the one who can see the track

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
  guessing which optimistic change to unpick is worse than asking the database.
  **The decision uses the status the server actually sent**, carried through
  by `failureFrom` in `queue.ts`, plus the SQLSTATEs that mean "try again"
  whatever their status: timeouts, deadlocks, serialization failures,
  connection errors, and PostgREST's `PGRST000`–`003` for not reaching the
  database. The sender used to guess a status from the code and map every
  `PGRST…` code to 400, so a Supabase database outage dropped every tick
  queued during it. Keep the decision in `queue.ts`, where it's tested.
  A 401 *"JWT expired"* is retried too, because supabase-js refreshes the
  token before the next attempt. It's matched on the message, because
  PostgREST has moved its code between versions. A token that's wrong rather
  than expired is still a refusal.
  **The registrar is told what was lost, in words they can act on.**
  `training/lost-write.ts` builds the sentence from the write itself (*"£10
  from the Kellys wasn't recorded. Note it on paper."*), with Postgres's text
  underneath for whoever investigates. Every refusal stays on screen until
  it's dismissed. A new tap doesn't clear one, because a lost cash entry
  must not be pushed off the screen by the next tick
- **A save indicator in the header says whether writes have landed**:
  *Saved*, *Saving* or *Offline*, with an icon, in a slot of fixed width next
  to the session time (`components/registrar/SyncStatus.tsx`, `syncStatus` in
  `queue.ts`). It's the Google Docs pattern. Writes go out on nearly every
  tap, and the line that used to say "2 changes still sending" came and went
  with them and moved the whole list. A screen reader hears the full sentence
- **Offline, Money collected still gets an amber line** under the header,
  because the indicator's one word can't say that another phone's takings may
  be missing. That changes rarely, not on every tap
- **One outbox for the phone, not one per screen.** Mounted at the island root,
  so a tick owed for Monday's session keeps being retried while the registrar
  is on the picker or in another session. A queued write names its own author;
  nothing is resolved at send time that could be resolved at tap time
- **The screen catches up when a restored backlog clears.** A queue loaded from
  storage lands after the view has already loaded, so the database has moved
  and the view cannot know. Reloading after every tap would be a round trip per
  tick, and the optimistic state is already right in that case
- **The other phone nudges; it doesn't send data.** When this phone's writes
  land, it sends an empty "changed" message on a Supabase Realtime
  **Broadcast** channel, one per session (`session-<id>`) and one per day for
  the session list (`sessions-<day>`). The phone that hears it refreshes
  through the existing rule in `lib/training/watching.ts`: only when it owes
  nothing, has no sheet open and is on screen, so a nudge that arrives mid-tap
  waits for this phone's own writes. About a second behind, with nothing to
  merge (`lib/training/nudge.ts`, `components/registrar/nudges.ts`)
- **Broadcast, not table changes, on purpose.** Broadcast needs no migration
  and no table in Realtime's publication, and carries no rows for RLS to
  check. The channels aren't private: anybody holding the public key and a
  channel name could send a nudge, but it carries nothing and only makes a
  phone refresh, and session ids are random UUIDs. Both sides send over HTTP
  (`httpSend`), so neither has to hold a connection open to send
- **The admin site nudges too**, so an admin setting things up at the last
  minute reaches the phones within a second. Every admin form that succeeds
  calls `nudgeTheRegistrarApp` (`lib/training/admin-nudge.ts`) before its
  redirect, because every one of them changes something the app shows. It
  nudges today's session list and every session on today, plus the session
  it changed and that session's day (`channelsForAdminChange`). It waits at
  most two seconds, since a Worker drops unfinished work once it has
  responded, and a failure never fails the form. **A new admin form that
  writes should call it too**
- **The poll is the safety net under the nudges**: every minute, and on
  coming back to the app. It catches a missed nudge and anything sent while a
  phone had no signal
- **The session list refreshes itself the same way**, so a session the other
  phone has just started appears without anybody pressing anything. It
  refreshes quietly: the list stays until a new one arrives, and a failed
  refresh leaves it alone. There used to be a **Check again** button for this
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
does not cover a bare `/registrar`. The old manifest's `start_url` and `scope`,
the club app's sections list and the Home card all use the slash.

Navigations are network-first so a deploy lands the moment there is signal, with
the cached shell as the fallback. Hashed `/_astro/` assets are cache-first,
because the hash *is* the version. The app's other files (manifest, icons,
logo) are network-first too, with the cache as the offline fallback: their
names don't change with their contents, and serving them cache-first kept the
old manifest, and so the old icon, on phones that had opened the app before.
**Cross-origin requests are never touched** —
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

A sign-in link tapped in Mail opens Safari rather than the installed iOS app,
so **a lapsed session is recovered inside the app, with the code from the
sign-in email** (`SignedOut.tsx`, see *Sign-in flow*). The app sends the
email itself and verifies the code through the browser client, so the
session lands in the app's own cookies and nothing navigates out of
`/registrar/`. Safari has no install prompt, so iOS gets a written hint where
Chrome gets `beforeinstallprompt`.

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

## Changing an image means changing its name

`public/_headers` caches every `.png`, `.jpg` and `.svg` for a year, and
Cloudflare's edge and every browser hold them to it. New artwork saved over an
old file name is never seen: the first icon change kept its names, and the live
site went on serving the old icons from the edge. Give a changed image a new
name (`icon-192-v2.png`, `favicon-v2.svg`) and update what links to it. HTML
and the manifest aren't long-cached, so they pick up a new name at once.

For the club app, rename the manifest too (`manifest.webmanifest` in
`public/app/`) and update every page that links it, and bump both workers'
`VERSION`. A phone keeps running its old worker until every
tab with the app is closed, and a worker older than `registrar-v3` serves the
manifest from its cache.

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

**`astro build` isn't the only thing that does it.** The cache was rewritten
twice during the Round 2 reviews with no build running, both times to the
same hash (`5a04923f`), and both within a minute of running `pnpm test` and
`astro check` together. The second time, `package.json` had also just
changed, and Astro restarts the dev server when that file changes. Which of
these is responsible isn't pinned down yet. If the registrar island goes
blank after either, check the hash before anything else.

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

**An interrupted Add recovers on the next run.** Adding a principal takes two
writes that nothing makes atomic: the login, then the `principals` row. If the
row fails, the login is left with no household. `loginFor` treats a refusal
for an already-registered address as the trace of that earlier run, finds the
login and links it, rather than failing on every later run. Any other refusal
still fails the action.

`loginFor` lives in `lib/auth/logins.ts` and `/admin/households` uses it too.
It returns whether it **created** the login or **found** it. Anything that
deletes a login when its own insert fails must only delete one it created: a
found login belongs to an earlier attempt, or to a household that already
exists. That's why the admin page refuses an email that already belongs to a
household before it touches logins at all.

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

**The screens that edit people follow the same contract.** `lib/people.ts`
(`planHousehold`, `planMember`, `planMemberEdit`, `planDisplayName`) turns
those forms into a row or a sentence, and rejects a date of birth in the
future or before 1900, a date that doesn't exist, and a membership status
other than paid or lapsed. Those checks used to live in the pages, untested.

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

**A household's history is one page.** `/members/credits` lists sessions,
payments and corrections together, newest first (`lib/credits/history.ts`).
Every paid session is already a ledger line, so a separate training history
page repeated it; what that page had and the statement didn't, sessions that
cost nothing, are added from attendance as lines of their own. Session lines
name the squad, on the admin statement too. A filter by member appears only
when two or more members have lines, and the wording assumes neither one
member nor several. `/members/training` redirects there. An admin sees a
member's 20 most recent sessions on `/admin/members/[id]`
(`training/history.ts`).

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

**A charged sign-in can't leave without its money.** A `BEFORE DELETE` trigger,
`attendance_keeps_its_money`, refuses to delete a member's attendance row while
its `session:{id}` debit has no `untick:{id}` refund. So the RLS delete
policy can't be used to remove a sign-in and keep the £2. The untick writes the
refund first and deletes second, which is how it passes. Guest rows and
uncharged member rows (a free session) carry no money and delete freely.
**Anything new that removes attendance has to give the money back first**, or
the trigger refuses it.

**An untick follows its alias.** A phone mints the attendance id at tick time.
If the other phone at the gate already signed that runner in, `sign_in_member`
returns the other row and records the phone's id in `attendance_aliases`
(alias -> real row), and `undo_member_sign_in` follows it. The alias cascades
with the row. That is what makes a replayed untick safe: once the row is gone,
the alias is gone too, so a retry that lands after somebody re-ticks the runner
finds nothing, instead of deleting the new sign-in. Don't replace it with a
(member, session) fallback, because that version deletes the re-tick. Every key
derives from the real row's id, so two phones unticking the same runner still
refund once. Migration `0019`.

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

**A read rule works out the role once per query.** Every RLS policy wraps
its role or identity call as `(select public.can_run_a_session())` or
`(select auth.uid())`. Postgres then evaluates it once per query as an
InitPlan, not once for every row it checks. Unwrapped, the registrar's
balances read re-parsed the JWT claims for every ledger row, on every
refresh. Migration `0022`. Copy the wrapped form into any new
policy.

**Every function pins its search path** (`SET search_path = public, pg_temp`).
The seven older functions that didn't were fixed in `0021`. Copy that into
anything new, along with `IS NOT TRUE`.

**A guest has functions of their own, for the same reason as the alias.**
`sign_in_guest` and `undo_guest_sign_in` (migration `0023`). Their cash lives
on the attendance row, so a tick is one table, but the untick used to delete
by (guest, session), and a replayed untick then deleted the guest's re-tick
and the £2 on it. Now the phone mints the row id, the tick records an alias
when the other phone got there first, and the untick deletes by id or alias.
What the guest paid comes from the session's price on the server. Each
member function refuses a guest's row and each guest function refuses a
member's, with a sentence saying which to use. A guest untick queued by an
older app with no id is still sent the old way, so it isn't lost.

**A free session is attendance and nothing else** (`price_pence = 0`, allowed
since `0012`). `credit_transactions` is `CHECK (amount_pence <> 0)`, so a zero
debit cannot be written whatever anybody decides — which is why `sign_in_member`
branches on the price rather than inserting the pair unconditionally. Nothing was
taken, so an untick gives nothing back. A guest at a free session has
`amount_paid_pence` NULL, not 0.

**A member who trains free is the same, for one runner** (`members.trains_free`,
migration `0025`). Coaches, life members, whoever the committee decides. It's a
setting on the member, not the household, because siblings can differ, and it
carries a short reason (`trains_free_reason`, allowed only while it's on).
`sign_in_member` writes the attendance and no debit, so the untick and the
`attendance_keeps_its_money` trigger need nothing new. Turning it off charges
from the next sign-in. Any admin sets it on `/admin/members/[id]`
(`planFreeTraining` in `people.ts`): it's a money decision like the ledger
forms, not an identity edit. The registrar app shows **∞** where the balance
would be, with no warning colour and no cash cell, and prices the tap at 0
(`priceFor` in `usuals.ts`) so the household's balance doesn't move. The
printed sheet shows ∞ too. A member's training history reads what each
sign-in actually cost from its debit (`chargesBySignIn`), not the session's
price.

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
the one that says it leaves — **Your own account →**, which inside the club app
gives way to the section switcher. Home offers one door in reply, a single
**Admin** card, rather than five links into the deep end.

`/admin` redirects to `/admin/sessions`. **There is no dashboard on purpose** —
the first screen is the job that actually recurs, not a page of figures standing
between an admin and it.

**A successful form redirects; a reload is a GET.** Every admin page calls
`redirectAfterPost` (`lib/http/after-post.ts`) once its form succeeds: a 303
back to itself, with the confirmation in a one-minute cookie that's read
once. The cookie keeps "James Conway added." out of URLs and logs. Before
this, reloading resubmitted the form, and creating a session that way made a
second identical one, which splits a night between two registrars. A failed
form still renders its own result, keeping what was typed. **A form that
creates a row also carries an id minted when it's drawn** (`lib/http/form-id.ts`).
The page inserts under that id and ignores a conflict, so a double click
writes once. Copy both into any new admin form.

**A page asks the middleware who's signed in, not Supabase Auth.** The
middleware already calls `auth.getUser()` and reads the principal for every
`/members` and `/admin` request, and it puts both on `Astro.locals`. Pages
read them with `whoIsSignedIn(Astro.locals)` (`lib/auth/signed-in.ts`). Each
page used to repeat both lookups: four round trips before its own data, now
two. `/members` went from 430 ms to 213 ms. Don't call `getUser()` in a
gated page.

**`astro check` reports a page's `redirectAfterPost` import as unused.** It
doesn't count a use inside a top-level frontmatter `return`, the same reason
`callback.astro`'s `redirectForUser` has always shown as a hint. Those hints
are expected. Don't remove the imports.

**A page read that fails fails the page.** Every server read goes through
`orThrow` (`lib/supabase/or-throw.ts`), and so does the middleware's. A
Supabase blip used to render as an empty club: no households, a £0.00
float, a statement with no lines. In the middleware it signed the user out
as "not registered". Now it reaches `pages/500.astro`, which says the
records couldn't be reached and shows nothing about the error. Never
destructure only `data` from a query.

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

So `/admin/households/[id]` carries both halves — who the household is, then
its members, then **Training credit**: the balance, the three ledger forms
(cash, an adjustment, a transfer) and the statement, under an anchor so the
balance in the header can point down at it. Changing the name, role or account
status is folded into one **Edit household** section, superusers only,
because it happens rarely and it stood between an admin and the credit.

**There's no admin form to charge a session.** A session is charged when a
registrar signs a runner in, and a missed night is put right from the
registrar app's Past sessions, which records the attendance with it. An admin
charge had no session behind it, so it had no squad on the statement and
never counted as attendance. Money outside that fortnight is an adjustment.

**The admin lists show the club, not the database.** Households and Members
have no Source column, and a household's role shows only as a badge beside
the name when it isn't "member", so the volunteers stand out. Both are on the
detail pages.
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

**`/admin/sessions` shows the past twelve weeks at a time.** `pastWindow` in
`training/sessions.ts` picks the window, which starts and ends on UTC
midnights so paging back never skips a session. The page reads attendance and
ledger rows only for the sessions in it. Upcoming sessions and the total count
are always shown, with a link to the twelve weeks before. Listing every
session ever meant reading every row ever written, about 44 sequential
requests after three seasons.

Four screens, and between them they make the Phase 5 schema usable: `/admin/squads`
(add, rename, retire), `/admin/squads/[id]` (who trains with a squad: its
members, each with Remove; who has been coming without being one, with Add to
squad; and a search to add anybody else, one member at a time),
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
- **A read that grows with the club's history goes through `everyRow`**
  (`lib/supabase/every-row.ts`). PostgREST stops at 1000 rows on hosted Supabase
  without raising an error, so a total added up from that read is quietly
  wrong. That had already happened to money collected on `/admin/sessions`.
  `everyRow` pages until an empty page comes back, and throws rather than
  returning part of the rows. Order the query by a unique column. Where the
  answer is naturally small, a view that returns that small answer is better,
  as with `squad_regulars`. Don't move a money rule into SQL to make a read
  smaller: `session-cash.ts` and `cash.ts` must agree, and a third copy in SQL
  would drift
- **`training/names.ts` is shared with the browser.** The member-assignment filter
  imports it from the page's `<script>`, so what the admin screen matches and what
  the registrar app will match cannot drift apart
- **`training/club-time.ts` reads a typed time as Omagh's clock, not the Worker's.**
  A `datetime-local` of `19:00` on a July evening is 18:00 UTC; storing it as 19:00Z
  would put every screen an hour out of step with the people on the track

## Reports

**A proof of concept**, with no requirements behind it yet; it may grow or go.
Two reports, attendance by week and money over a date range, with a switch
between them, and the Reports tab opens on the first. Each is a GET form, so
a report is a URL that can be bookmarked or sent, and `?format=csv` on the
same URL downloads it. One session's figures, a day's and every household's
balance are already on the Sessions and Households screens, so the reports
don't repeat them. There was a day report; the Sessions list is grouped by day
instead, with a total for a day that ran more than one session
(`byClubDay` in `sessions.ts`, `rollUpSessions` in `session-cash.ts`).

The rules are in `lib/reports/` and unit tested, like everything else.

- **A range is whole days on Omagh's calendar** (`range.ts`). A week starts on
  Monday
- **Money uses `session-cash.ts`'s rule**: cash top-ups, less refunds, plus
  what guests paid. Money taken at a session is dated by the session, so a
  night put right from Past sessions lands on the night. Money an admin
  recorded away from training is dated when it was recorded
- **A long range is filtered through the join**
  (`session:session_id!inner(starts_at)` with `.gte('session.starts_at', …)`),
  not an `.in()` list of session ids, which would outgrow the URL
- **A CSV text cell starting with `=`, `+`, `-` or `@` gets an apostrophe**,
  so a typed name can't run as a spreadsheet formula. Amounts go through
  `poundsCell`, which keeps them as numbers
- **`astro check` reports the CSV imports as unused**, for the same reason it
  flags `redirectAfterPost`: the CSV is returned from inside the frontmatter.
  Don't remove them

## Roles

**The trust model: registrars and admins are trusted volunteers.** A registrar
takes cash at the gate, so a dishonest one could simply pocket it, and no
database rule could stop that. Registrars aren't technical either: what the UI
doesn't offer, they won't do. So the system is built to stop **honest mistakes
and our own bugs**, not to defend against the people the club has chosen to
trust. A volunteer bypassing the app to misuse their own access is not a
finding (Round 2 backend, B1). These still count, whatever the role:

- anything the UI lets a well-meaning volunteer get wrong
- database checks that catch malformed rows, because they catch our bugs too
- privacy, because keeping data to what's needed is about the data, not the
  person
- outsiders: a lost phone, a stolen login, the public site

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
first_name, surname, is_active, trains_free`. A registrar can read every name in the club
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

## Database types

`lib/supabase/types.ts` is **hand-written, on purpose**. It narrows text
columns to the values their CHECKs allow (`PrincipalRole`,
`CreditTransactionType`), and it knows a view column is never null, which the
generator can't. `types-match-schema.ts` compares it with the live schema **at
compile time**: same tables, same columns, same nullability. After a
migration, run `pnpm supabase:types` (it writes `generated-types.ts` and never
touches `types.ts`), then `astro check`. A drifted table fails there and in
CI.

**Don't cast a query result through `unknown`.** Write the expected row shape
with `satisfies`, so TypeScript compares it with what the select string
actually fetches. The session picker once shipped asking for two dropped
columns because a cast hid exactly that. When a table points at another table
in more than one way, as `credit_transactions` does at `principals`, embed with
the explicit hint, `recorder:principals!created_by(display_name)`. PostgREST
resolves both forms the same way at runtime, but only this one gets a type.

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

**The sign-in email carries a code as well as the link** (Phase 9). Either
signs the person in. The code is for anybody reading their email somewhere
else, and above all for an iPhone home-screen app, which the link can't reach.
`/signin` shows a box for it once the email is sent, and the registrar app
asks for it on its signed-out screen. The rules are in
`lib/auth/sign-in-code.ts` and `lib/auth/sign-in-email.ts`. `POST
/signin/send-email` is the app's way to send the email, behind the same checks
as the page.

- **The link and the code are one token.** Using either spends both, and
  Supabase answers a spent code, a wrong one and an expired one with the
  same `otp_expired`. So one refusal sentence covers all three: check it
  again, and if you tapped the link, press Send another
- **`SIGN_IN_CODE_LENGTH` must match the dashboard's Email OTP Length**
  (6). The screens say how many digits to type and refuse any other length
- **The Magic Link template must show `{{ .Token }}`.** It's a dashboard
  setting, recorded in `OPERATIONS.md`. Without it both screens ask for a
  code the email doesn't contain
- **A limit on guesses of our own would stop nothing.** Supabase's
  `/verify` takes a code from anyone with the public key, so a guesser goes
  round the site. The code's length, its lifetime and Supabase's per-IP rate
  limit are what protect it (`OPERATIONS.md`)
- **A Turnstile token is good once.** `whyNotThisMember` is the only place
  that checks it; `/signin` calls it before choosing between a provider and
  the email, so the email isn't allowed a second check
- **The security check fails closed** (`judgeCaptcha`). A missing secret, or
  Cloudflare not answering, refuses the request with a sentence. The secret
  is read from `locals.runtime.env`, as the service-role key is: Cloudflare
  puts secrets there, not in `import.meta.env`. Reading only the latter, with
  a fail-open behind it, meant the live site skipped the check entirely until
  the Phase 9 security review (S9-1)
- **A typed code is checked by the browser, never our server.** Supabase
  limits guesses per address, and a check from the server counts a Cloudflare
  address instead of the guesser's (S9-2). `/signin` and the registrar app
  both call `verifyOtp` through the browser client, which writes the session
  to the site's cookies. `/signin` then goes to `/members`, and the middleware
  takes anybody without accepted terms to `/signin/terms`

## Microsoft sign-in expiry

Azure caps an OAuth client secret at 24 months, and when it lapses Microsoft
sign-in breaks for every member at once. The button withdraws itself on the date
in `apps/site/src/lib/auth/microsoft-oauth.ts` rather than failing in the
member's face — magic link and Google carry on regardless.

**Renewing the secret in Azure means moving that date to match**, otherwise the
button stays hidden. Deleting the constant is the way to retire Microsoft
sign-in for good. **A test starts failing 60 days before the date**
(`microsoft-oauth.test.ts`) and CI runs it on every push, so the reminder
comes on its own. Its failure message carries the renewal steps, which are
also in `OPERATIONS.md`.

## Admin UI patterns

Every admin tab is a **list page** and a **detail page**, built from
`src/components/admin/`, with styles in `global.css` (`.btn`, `.field`,
`.admin-table`) and behaviour in `AdminLayout`'s one shared script.

- **List page**: `PageHeader` (one primary action, top right, opening a
  `FormDialog`), `StatTiles` (a tile is a plain figure, a filter with `filter`,
  or a link with `href`), `ListToolbar`, `ResourceTable`. Rows carry
  `data-href` and open anywhere on click; the name cell holds the real link.
  Searchable rows carry `data-search` and `data-tags`; `?filter=<tag>` starts
  a list filtered. **Nothing is edited on a list page.**
- **Detail page**: `RecordHeader` (pills, key `Figure`s), a Details
  `SummaryList` whose rows each have their own Change, related lists as
  `ResourceTable`s inside `Section`s, and `DangerZone` at the bottom for
  retire, cancel and deactivate.
- **On a phone** (below Tailwind's `sm`) the same pages change shape:
  - a black **tab bar** along the bottom (Sessions, Squads, Households,
    Members, More) replaces the tabs, and a detail page leads with
    **‹ its list** instead of a breadcrumb
  - every `ResourceTable` is a **list**: cells marked `cell-primary`,
    `cell-secondary` and `cell-trailing` make a two-line row with the figure
    on the right; other cells are desktop-only, and `mobile-only` cells are
    composed for the phone. Rows run edge to edge, and day or month headings
    stick to the top
  - the page's `primary` action (a `PageHeader` prop) floats above the tab
    bar in amber; the search bar sticks to the top with a clearable chip for
    the filter that's on; KPI tiles go compact and lose their hints
  - every `FormDialog` is a **sheet** from the bottom, closed by tapping
    outside it; `SummaryRow` puts the label above the value
- **Statements** (a household's credit history, for the member and the
  admin alike) use `components/Statement.astro`: month headings, a short
  title and detail, and the signed amount on the right (`summariseEntry`)
- **Access** is shown only through `AccessPills`, which reads `accessOf` in
  `lib/auth/roles.ts`. Moving from roles to privileges changes those two, not
  the pages.
- **Superuser is a developer's convenience, never shown to the committee.** To
  anybody but another superuser a superuser appears as an admin (`shownRole`),
  and no screen an admin can reach mentions the word, so nobody wonders
  whether the chair should have it. Admin is everything a committee member
  needs
