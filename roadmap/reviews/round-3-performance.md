# Round 3 — Performance

Reviewed at `0d1c6a3` (`main`). The roadmap's scope: *the queries behind each
screen, what the registrar app fetches on open, the reporting area over a few
seasons of attendance.*

**What could be measured and what couldn't.** Membership is already at full
size (314 members, 220 households), so anything that scales with membership
was measured. History is almost empty (28 ledger rows, 3 attendance rows), so
anything that scales with history is projected from the design. I didn't
generate test history to measure it: the ledger is append-only, so those rows
would stay forever. Timings are from the local dev server talking to
Supabase in Ireland. Production runs on Cloudflare's edge, closer to the
database, so its absolute numbers will be lower, but how they grow is the
same.

**A season, for the projections:** about 6,000 attendance rows and 8,000
ledger rows (~300 active members, ~5 sessions a week across squads, ~30 at
each, 40 weeks, plus cash).

The reporting area (Phase 6) isn't built. What it needs is at the end.

---

## PF1. Every read rule re-runs its role check on every row

**Severity: medium. Free today, and it grows with the ledger on the screen
used most at the track. Fixed by migration `0022`.**

All 13 read policies in force call a role or identity function directly:
`public.can_run_a_session()`, `public.current_app_role()`, `auth.uid()` or
`auth.jwt()`. None uses the `(select …)` wrapping Supabase recommends. Without
it, Postgres evaluates the function for **each row** the policy checks. Since
`0021` pinned the search path, these functions can't be inlined either. So
for every row a registrar reads, Postgres calls `can_run_a_session()`, which
calls `current_app_role()`, which calls `auth.jwt()`, which parses the
request's JWT claims again.

The ledger is where that adds up. The registrar app reads `principal_balances`
**when it opens and on every 20-second refresh, on every phone**, and that
view adds up the *whole* ledger, with the policy checked on every row it
touches.

| Ledger size | Policy calls per balances read | Reads per hour, two phones |
|---|---|---|
| today (28 rows) | 28 | 360 |
| one season (~8,000) | ~8,000 | 360 |
| three seasons (~24,000) | ~24,000 | 360 |

**Fix: one migration that rewrites the policies** with each call wrapped,
`USING ((select public.can_run_a_session()))`. Postgres then works the value
out once per query as an InitPlan. Who can read what doesn't change, only how
often it's worked out. It also cancels `0021`'s inlining cost. It's cheapest
done before go-live, while the policies are the only thing to change.

**Done.** `0022` rewrites all thirteen policies with `ALTER POLICY`, so each
keeps its name, command and roles. Verified by behaviour, because there's no
EXPLAIN access: before and after, the signed-in admin could read exactly the
same row counts from every table (3, 0, 28, 1, 34, 314, 220, 220, 5), and an
anonymous read still returned nothing. Who can read what is unchanged. The
saving shows only at scale.

Once that's done, the full scan behind `principal_balances` isn't a worry.
Narrow rows, with an index on `(principal_id, created_at)`. Even three seasons
of ledger is a scan Postgres does in milliseconds.

## PF2. Every signed-in page checks who you are twice

**Severity: medium. It's the largest fixed cost on every signed-in page. Fixed.**

| Page | Median (dev, 3 loads) |
|---|---|
| `/` (public, no database) | 3 ms |
| `/members/credits` | 360 ms |
| `/members` | 430 ms |
| `/admin/households` | 451 ms |
| `/admin/squads` | 488 ms |
| `/admin/households/[id]` | 550 ms |
| `/admin/sessions` | 645 ms |

Before a members or admin page fetches anything of its own, four requests run
one after another:

1. The middleware calls `auth.getUser()`, a network round trip to Supabase
   Auth.
2. The middleware reads the principal (`is_active`, `terms_accepted_at`,
   `role`).
3. **The page calls `auth.getUser()` again**, a second round trip to Auth.
4. **The page reads the principal again**, by `auth_user_id`.

Thirteen pages do this. Steps 3 and 4 repeat what the middleware has just
done for the same request.

**Fix.** The middleware already has the user and the principal. It should put
them on `Astro.locals` (`locals.user`, `locals.principal` with `id`,
`display_name`, `role`), and pages should read them from there. That removes
two of the four round trips from every signed-in page. It also removes the
repetition the code-quality review noted.

**Done.** The middleware puts `user` and `principal` on `Astro.locals`.
Ten pages read them through `whoIsSignedIn()`, which throws on a page the
middleware doesn't gate rather than rendering as nobody. The two squad pages
only used `getUser()` as a guard the middleware already provides, so the call
is gone. Measured the same way as above:

| Page | Before | After |
|---|---|---|
| `/members` | 430 ms | 213 ms |
| `/members/credits` | 360 ms | 221 ms |
| `/admin/households` | 451 ms | 325 ms |
| `/admin/sessions` | 645 ms | 467 ms |
| `/admin/households/[id]` | 550 ms | 476 ms |
| `/admin/squads` | 488 ms | 451 ms |

A smaller win in the same pages: independent reads are awaited one after
another. `/admin/households` reads principals, then member counts, then
balances. Each is a full round trip, and none depends on the others.
`Promise.all` would overlap them.

## PF3. `/admin/sessions` loads every session's history, forever

**Severity: medium. Correct since B2, but its load time grows without limit. Fixed.**

B2 made `/admin/sessions` correct by reading *every* attendance row and every
session-linked ledger row through `everyRow`, so no session's money figure is
cut off. But the page still lists every session ever run, so it reads every
row ever written, in sequential pages of 1,000:

| History | Rows read per load | Requests, one after another |
|---|---|---|
| today | 31 | 2 |
| one season | ~14,000 | ~16 |
| three seasons | ~42,000 | ~44 |

At three seasons that's seconds of waiting on the page the committee checks
the money on.

**Fix: show a bounded window.** List the last 12 weeks of past sessions, with
a link to older ones, and fetch attendance and ledger rows only for the
sessions on screen, using a bounded `.in('session_id', ids)` list of 50 ids at
most. The number of rows then depends on the window, not on the club's age.
The money rule stays in `session-cash.ts`, as B2 decided. Running the two
reads in parallel would halve what's left.

**Done.** `pastWindow` (five tests) picks twelve weeks starting and ending on
UTC midnights, so consecutive windows join with no gap. The page reads only
that window's sessions, then their attendance and ledger rows by a bounded
`.in()`, with the two reads in parallel. Upcoming sessions and the total count
are always shown. Verified: the recent window showed the same three sessions
with identical figures, the header counted all four past sessions, and paging
back through two empty windows found the 1 January test session. The first
end-date label was a day late in summer (*"to 28 Aug"* for a window ending at
the start of 28 August), because a UTC instant was shown in Omagh time.
Labelling from midday fixed it: *"5 Jun to 27 Aug"*, *"13 Mar to 4 Jun"*.

`/admin/squads` has the same shape (every session, to count per squad), but it
only reads one column. It stays small for years.

---

## For Phase 6: the reporting area

The roadmap asks about *"the reporting area over a few seasons of
attendance"*. It isn't built yet, but three rules from this review should
shape it:

- **Never page through all of history to answer a question about a range.**
  Every report takes a date range, and the query filters on it in the
  database.
- **Decide where the money rule lives before writing a money report.**
  Summing in SQL would make a third copy beside `session-cash.ts` and
  `cash.ts`. The options are a SQL function that the TypeScript rule is
  tested against, or bounded reads handed to the existing TypeScript rule.
- **Index for the ranges.** `training_sessions (starts_at)` is already
  indexed. Attendance by member over a range wants `(member_id, created_at)`,
  which `0009` already has. Check the plans when the queries exist.

## Notes, not findings

- **What the registrar app fetches doesn't grow with history.** The roster is
  57 KB of uncompressed JSON (314 members with household names), balances are
  16 KB (220 households), and `squad_regulars` is one row per member who's
  trained with that squad. All of it depends on membership, not on how long
  the club has used the app.
- **The 20-second refresh** is three requests per phone, about 16 KB of
  balances plus the night's rows. That's fine on mobile data.
- **Guests** is every guest ever, fetched in full. It's 1 row now and
  will grow slowly. Worth limiting to recent guests in a season or two.

## What stood up

- **Opening a session at the track.** Seven queries in parallel, the slowest
  about 150 ms, then one more for the registrar's own id.
- **The registrar app's code is small and cached.** 41 KB of app code (13 KB
  compressed) and 216 KB of React and Astro's island runtime (67 KB
  compressed), from CI's build output. The service worker serves both from
  cache after the first visit.
- **The public site ships no app JavaScript.** Checked on the live
  `omaghharriers.com`: no Astro island and no React on the home page, just
  two small inline scripts and Cloudflare's 0.9 KB email script. In dev,
  Astro's React integration injects its preamble on every page, so this can
  only be checked against a real deployment.
- **The public home page renders in 3 ms**, because it never touches the
  database.
