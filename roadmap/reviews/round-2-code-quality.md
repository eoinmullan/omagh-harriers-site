# Round 2 — Code quality

Reviewed at `2f8c698` (`main`). The roadmap's scope is the lib-module contract
(*rules out of pages, unit tested without a database*) and whether it has
held, plus the test suite itself. It also takes over B6 from the backend
review: whether TypeScript can see what a query returns.

Findings are judged against the trust model in CLAUDE.md (Roles). The ones
that count are our own bugs and honest mistakes.

---

## Q1. The queue drops writes when Supabase's database is down

**Severity: high. The queue's central promise breaks on the most likely bad
night. Fixed.**

CLAUDE.md says of the registrar's write queue: *"Retry forever on a dropped
connection; give up on a refusal."* `isWorthRetrying` in `queue.ts` puts that
rule into code: retry with no status, with 408, 429, or anything from 500 up,
and give up on anything else. It's unit tested.

But it never sees a real status. `queue-sender.ts` throws away the HTTP status
supabase-js returns with every response and makes one up from the SQLSTATE
code instead:

```ts
function statusOf(code: string | undefined): number | undefined {
  if (!code) return undefined;
  if (code.startsWith('PGRST')) return 400;
  if (code === '42501') return 403;
  if (code === '23505' || code === '23503' || code === '23514') return 409;
  return 400;
}
```

Every `PGRST…` code, and every SQLSTATE it doesn't recognise, comes out as
400, and the queue drops a 400. That covers:

| Code | Means | Real status | What the queue does |
|---|---|---|---|
| PGRST000–002 | PostgREST is up but can't reach the database | 503 | drops the write |
| PGRST003 | timed out waiting for a database connection | 504 | drops the write |
| 57014 | statement timeout | 500 | drops the write |
| 40001, 40P01 | serialization failure, deadlock | 500 | drops the write |

So when the phone's wifi drops, every tick survives. When Supabase's
database has a moment and its API doesn't, every tick queued in that moment
is dropped as though Postgres had refused it. Since F3, each one shows on
screen as *"…'s sign-in wasn't saved"*, so it isn't silent any more, but the
registrar still has to tick everyone again.

`queue-sender.ts` has no tests at all. This rule decides between retrying and
giving up, which is the most consequential decision the registrar app makes,
and it was never checked against the codes Supabase actually returns.

**Fix.** Make the decision a pure, tested function that takes the response's
own status and code. Retry on no status, on 408 or 429, on anything from 500
up, and on the transient SQLSTATEs even when they arrive with a 4xx. Refuse
on 42501, 23514, 23503 and our own P0001 sentences. Treat 23505 on a cash
insert as success, as now. Test it against each row of the table above.

**Done.** `failureFrom` in `queue.ts` carries the response's own status and
code. `isWorthRetrying` also retries the transient SQLSTATEs and PostgREST's
connection codes whatever status comes with them. `statusOf` is gone. Seven
new tests, including the original bug end to end: `PGRST001` at 503 is now
retried. Checked through the real client in the browser: a refusal (a tick
into a cancelled session) arrives as `400 / P0001` and is dropped with its
notice, and a failed `fetch` arrives as status 0 and is retried. A real 503
from Supabase can't be produced on demand, so that row is covered by the
tests.

## Q2. CI runs no tests, and every merge today skipped CI entirely

**Severity: medium. Fixed.**

`.github/workflows/ci.yml` runs on `pull_request` only, and runs
`pnpm -r typecheck` and `pnpm -r build`. It never runs the tests, and the
roadmap's note that *"293 tests pass only when somebody remembers to run
them"* is still true at 420. This round merged straight to `main` with a
fast-forward push every time, which runs no workflow at all. Every check in
this round was a local run.

**Fix.** Two lines, since a root `test` script already exists: add
`- run: pnpm -r test`, and add `push: branches: [main]` to the triggers. The
suite runs in under a second.

**Done**, both lines. `pnpm -r test` was run from the root first, as CI will
run it, and passed with 427 tests. Whether the workflow file is valid will
show on the first push to `main`.

There's also no linter or formatter config in the repo. That's a note, not a
finding. The code is consistent by hand.

## Q3. Adding a household by hand has the gap B3 closed in the sync

**Severity: medium. Fixed.**

`/admin/households` adds a household the way the sync used to: create the
login, then insert the principal. If the insert fails, the login is left
behind, and every later attempt with that email is refused as *"already
registered"*. `loginFor` fixed exactly this for the sync and is unit tested,
but it lives in `sync/klubfunder.ts` and the page doesn't use it.

**Fix.** Move `loginFor` and `LoginDirectory` to `lib/auth/`, and have both
the sync and the page use them.

**Correction.** The page was less broken than this says. It already deletes
the login it just created when the insert fails, so a login is only left
behind if that cleanup also fails, or the request dies in between.

**Done, and the obvious version would have caused a new bug.** Simply
calling `loginFor` from the page would, for an email that already belongs to
a household, *find that household's login*. The insert would then fail on
the duplicate email, and the page's cleanup would **delete that household's
login**. So `loginFor` now returns `{ id, created }`, the page refuses an
existing household's email before touching logins, and it deletes a login
only if this request created it. `loginFor` moved to `lib/auth/logins.ts`,
with its tests, and the sync uses it from there.

## Q4. The contract held everywhere except the screens that edit people

**Severity: medium-low. Fixed.**

The lib-module contract has held almost everywhere it was meant to. The
ledger (`ledger.ts`), roles (`roles.ts`), squads (`groups.ts`), sessions
(`sessions.ts`), the night's cash (`cash.ts`, `session-cash.ts`), the
registrar's lists and taps (`usuals.ts`, `night.ts`, `queue.ts`, `tonight.ts`,
`watching.ts`, `track-session.ts`, `guests.ts`) and the sync's planning all
follow it: the page hands a form over and gets back rows or a sentence.

The exceptions are the three screens that edit people:

| Page | What sits in the page |
|---|---|
| `/admin/households`, add | which fields are required, the principal row's shape |
| `/admin/members`, add | which fields are required, the member row's shape |
| `/admin/members/[id]`, edit | which fields are required, the update's shape |

None of it is tested, and it's the thinnest validation in the app. It checks
that fields are present and nothing more. A date of birth of `2109-05-01` is
accepted. These are also the screens an admin uses by hand most often.

**Fix.** Add a `lib/people.ts`, with `planHousehold`, `planMember` and
`planMemberEdit`, shaped like `ledger.ts`: a row to write or one sentence, unit
tested. Add a date-of-birth sanity check (not in the future, not absurdly far
back).

**Done.** `lib/people.ts`, with 16 tests, now covers adding a household,
adding a member, editing a member, and renaming a household, a fourth page
that also checked its input inline. It rejects a date of birth in the future,
before 1900, or one that doesn't exist (30 February), and a status other than
paid or lapsed. The member edit page used to cast `status` straight from the
form. **Not exercised live:** all four actions are superuser-only, and the
signed-in account is an admin. The pages still render, and `astro check`
covers the wiring.

## Q5. The types are accurate. The casts are the risk (B6, resolved)

**Severity: medium. This is the class of bug that took the registrar app
down today. Fixed.**

`types.ts` is hand-written, and the backend review assumed that meant drift.
It doesn't, yet. The live schema's generated types were compared with the
hand-written file table by table:

- **Every table matches**, column for column and on nullability.
- `attendance_aliases` is missing, but only the RPCs use it.
- **The two views are better hand-written.** Postgres can't infer
  nullability through a view, so generated types mark every view column
  nullable, including `principal_balances.principal_id`, which never is.

So the session picker didn't break because the types drifted. The type said
`note`, correctly. The *query string* asked for dropped columns, and the
result went through `unknown`, so TypeScript never compared the two.
Regenerating the types wouldn't have caught it, but removing the cast would
have.

**Fix, in this order:**

1. **Remove the ten casts through `unknown`** listed in the frontend review
   (F4), and give `types.ts` the `Relationships` that postgrest-js needs to
   type each embed such as `group:group_id(name)`. Missing relationships are
   probably why the casts were added. With the casts gone, selecting a column
   that doesn't exist fails `astro check`.
2. **Keep the hand-written types, and check them against the database.**
   Commit `pnpm supabase:types` output as `generated-types.ts`, regenerated
   after each migration, and add a unit test that fails when its tables and
   columns differ from `types.ts`. That's drift detection, without inheriting
   the nullable view columns.

**Done, and it showed why the casts existed.** With all ten removed (eight
replaced by `satisfies`, two by typed parameters), `astro check` reported
nine errors, all the same: `credit_transactions` points at `principals` three
ways, so the type inference couldn't tell which one `recorder:created_by(…)`
meant. PostgREST resolves that form fine at runtime, which is why the pages
worked. Rewriting the three selects as `principals!created_by(…)` made them
type-check without changing anything at runtime. Recorders, households and
transfer counterparties still render.

The drift check is `types-match-schema.ts`, checked at compile time: same
tables, columns and nullability, and the same columns on the views. It was
proved by breaking it twice. Dropping `members.gender` failed on `members`,
and claiming `training_sessions.note` can't be null failed on
`training_sessions`. The file was restored byte-for-byte afterwards.
`pnpm supabase:types` used to write **over** `types.ts`, so running it after a
migration, as its own comment suggested, would have thrown the hand-written
types away. It now writes `generated-types.ts`. `attendance_aliases` was added
to the hand types so the table lists match.

## Q6. A rule about money has no test

**Severity: low. Fixed.**

`credits/cash-label.ts` turns pence into what a registrar says at the gate:
*"£10"*, not *"£10.00"*. It's 13 lines, it shows on every cash cell and in
F3's lost-cash sentence, and nothing tests it.

**Done.** Five tests: round and part amounts, the sign dropped, zero, and the £1,000 maximum.

---

## Notes, not findings

- **`klubfunder.ts` is 1,044 lines**, the largest module. Parsing and planning
  are tested. Applying is tested only through `loginFor`.
- **`AttendanceView.tsx` is 936 lines.** Most of its rules are already in
  `lib/`, so its size is mostly layout and wiring, not hidden logic.
- **The household page is 809 lines on purpose**, because folding credit into
  the household was the point of that redesign.
- **Six admin pages look up the acting principal themselves**, straight after
  the middleware has read the same row. Putting it on `Astro.locals` in the
  middleware would remove the repetition, and one database round trip per
  page.
- **The roadmap's "293 tests"** is from Phase 5. There are now 420, in 29
  files.

## What stood up

- **The lib-module contract**, across every module listed in Q4. A page
  decides nothing, and the rules run in under a second with no database.
- **The hand-written types match the live schema** on every table, and are
  more accurate than the generated ones on the views.
- **The test style.** Arrange, act, assert, with no mocking framework: plain
  fakes where a seam is needed, like `LoginDirectory` and `everyRow`'s pager.
- **Every fix this round landed with tests**: 391 → 420, with no fix left
  untested where a pure rule could be pulled out.
