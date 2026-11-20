# Round 2 — Backend

Reviewed at `6f41d96` (`main`). The roadmap's scope: *migrations, RLS policies,
the RPCs, PostgREST query shapes, the sync CLI.* Round 1 asked targeted
questions. This pass reads the backend as code.

Open Round 1 findings are **not** repeated here: data integrity 4 and 5,
security S2, S3 and S5, and privacy P3 to P6. Everything below is new.

---

## B1. A registrar's write rules accept any row

**Severity: high. This one was missed in Round 1.**

Four INSERT policies serve the registrar, and each checks one thing: that the
caller may run a session.

| Table | `WITH CHECK` |
|---|---|
| `credit_transactions` | `can_run_a_session()` |
| `attendance` | `can_run_a_session()` |
| `training_sessions` | `can_run_a_session()` |
| `guests` | `can_run_a_session()` |

None of them looks at the row being written. So a registrar's token, used
directly against the REST API rather than through the app, can:

- **Add credit to any household.** It can insert a `manual_adjustment`,
  `top_up_stripe`, `top_up_cash` or `transfer_in` for any principal, at any
  amount the sign CHECK allows. A `transfer_in` needs no matching
  `transfer_out`, so this creates money from nowhere.
- **Sign a member in without charging them.** It can insert the member's
  attendance row directly, skipping the RPC that writes the charge. That's free
  training no screen would show.
- **Set the price of a night.** It can insert a session at any `price_pence`,
  and `sign_in_member` then charges every runner ticked into it that amount.
- **Write it all under someone else's name.** `created_by` and `recorded_by`
  aren't tied to the caller, so a statement line's *"recorded by …"* can name
  anyone.

The app does none of this, and Round 1 confirmed that. That was the gap: the
Round 1 security pass checked what the app writes, not what a registrar's
login could write without it. A registrar is a volunteer, and often on a
borrowed phone.

**Why the policies are this wide.** `sign_in_member` and `undo_member_sign_in`
are SECURITY INVOKER, so their own inserts have to satisfy these policies: a
`session` debit, an untick `manual_adjustment`, and a member's attendance row.
Whatever the RPC can write, the token can write directly, with any values.
`0011`'s comment justifies invoker with *"RLS already says who may write
what"*. These policies only say who may write. They don't say what.

**Options.**

- **A (recommended): make the two RPCs SECURITY DEFINER and narrow the
  policies.** The RPCs keep their role guards and get a pinned search_path.
  Each policy then allows exactly what the app writes directly:

  | Table | Allowed through the policy |
  |---|---|
  | ledger | `type IN ('top_up_cash','refund')`, `session_id` set, `member_id` null, `created_by` = caller |
  | attendance | guests only (`member_id IS NULL`), `recorded_by` = caller |
  | sessions | `created_by` = caller, and a price check (below) |
  | guests | `created_by` = caller |

  This reverses `0011`'s stance, and the reason changes with it. The RPC
  becomes the rule for charging and refunding, because it's the only thing
  allowed to do either.

- **B: keep SECURITY INVOKER and validate content with deferred constraint
  triggers.** At commit, each `session` debit would have to match its
  attendance row and price, each untick would have to reverse an existing
  debit, and each member attendance row at a priced session would need its
  debit. This keeps `0011`'s design, but it's more SQL, and every rule in it
  has to stay exact.

Either way, **tying `created_by` and `recorded_by` to the caller** is a
policy-only change that can land first.

The session price is the awkward part of A. The price lives in TypeScript
(`DEFAULT_SESSION_PRICE_PENCE`), so a database check needs either a second
copy of it, or something looser that only rejects absurd values, such as a
cap.

This was reasoned from the policy text and not exploited. I didn't write test
credit to prove it.

## B2. Totals are computed from reads that PostgREST silently cuts off

**Severity: medium. They start going wrong within the first season.**

Supabase's hosted API stops returning rows after a maximum, which is 1000 by
default, and it doesn't raise an error. `supabase/config.toml` doesn't
override it. Three screens fetch history in one request and add it up in
JavaScript:

| Where | What it fetches | When it goes wrong |
|---|---|---|
| `/admin/sessions` (`:102`, `:109`) | attendance and ledger rows for **every past session**, for headcount and money collected | within months: two sessions a week at 15 runners passes 1000 rows before the season ends |
| registrar Usuals (`AttendanceView:137`) | every attendance row the squad has ever had, to learn who usually comes | a busy squad crosses 1000 rows in a season, after which the list learns from an arbitrary subset |
| `/admin/squads` (`:92`) | every session, to count them per squad | after about 1000 sessions |

The worst outcome is the first one: the money-collected figures that get
checked against the tin will be wrong, quietly, and only for some sessions.
`/admin/sessions` also passes every past session's id in a single URL
(`.in('session_id', pastIds)`), which will reach a URL-length limit too.

Fix: compute these in Postgres, with a view or a function per figure that
returns one row per session or squad, rather than shipping raw history to add
up. Round 3's performance pass would ask for the same thing. Confirm the
max-rows value in the dashboard's API settings, since the hosted default is
1000.

## B3. The sync can leave a household it can never add

**Severity: medium-low.**

Adding a principal takes two writes: `auth.admin.createUser`, then the
`principals` insert. Nothing makes them atomic. If the insert fails, the login
exists with no household. On the next run the plan proposes the same Add,
`createUser` refuses the email as already registered, and that repeats every
run until somebody removes the login in the dashboard. The sync never looks up
an existing auth user.

Everything else in `applyPlan` runs action by action and can be re-run, since
each run builds a new plan. This is the one step that doesn't recover.

Fix: write the row the plan can see first, which is the `principals` row with
a null `auth_user_id`. Then create the login and link it. A failure then
leaves a principal without a login, which the next plan can detect and finish.

## B4. Seven functions don't fix their search path

**Severity: low.**

`current_app_role`, `is_club_admin`, `can_run_a_session`,
`own_household_member_ids`, `custom_access_token_hook`,
`forbid_credit_transaction_rewrite` and `set_updated_at` don't
`SET search_path`. All of them run with the caller's permissions and use
schema-qualified names, so the practical risk is small. Supabase's linter
flags them anyway. The access-token hook matters most, because it runs on
every token issued.

Every function written this session pins the search path. One migration of
`ALTER FUNCTION … SET search_path = public, pg_temp` would cover the other
seven.

## B5. TRUNCATE bypasses the append-only ledger

**Severity: low. Not reachable through the API.**

The roadmap asked about this directly. The append-only trigger is
`BEFORE UPDATE OR DELETE … FOR EACH ROW`, and TRUNCATE fires neither. PostgREST
can't issue a TRUNCATE and no RPC does, so it's out of reach of every login.
But Supabase's default grants give TRUNCATE to `anon` and `authenticated`, and
anyone using the dashboard or SQL as the owner can empty the ledger with no
check at all.

Fix: revoke TRUNCATE from `anon` and `authenticated`, and add a
statement-level `BEFORE TRUNCATE` trigger to `credit_transactions`. Emptying
the ledger then takes a deliberate `ALTER TABLE … DISABLE TRIGGER` first.

**Order matters.** The test-data cleanup that's still waiting needs a TRUNCATE.
Do the cleanup first, then add the guard.

## B6. TypeScript can't see what a query returns

**Severity: medium. Shared with the code-quality review.**

`types.ts` is hand-maintained. Its header says *"Regenerate with
`pnpm supabase:types` once the Supabase CLI is set up"*, and the CLI is now
set up. Nine casts through `unknown`, across seven files, plus the
`asSelectable(row: unknown)` pattern in the picker, mean TypeScript accepts
whatever shape a page declares rather than what the query actually returns.

That's how the session picker shipped broken. supabase-js checks select
strings against the `Database` type, so with accurate types and no casts, a
query for a dropped column would fail to compile.

It isn't a one-command fix. The generated file uses different export names
from the hand-written aliases the code imports, such as
`CreditTransactionInsert`. Running the script would replace the file and break
those imports. How to make the switch belongs to the code-quality review.

---

## Notes, not findings

- **RLS policies call `auth.uid()` and `auth.jwt()` on every row checked.**
  Supabase recommends wrapping them as `(select auth.uid())` so Postgres
  evaluates them once per query. That's for Round 3.
- **`sign_in_member` doesn't refuse a lapsed member**, or a session on another
  day. The app filters both, so whether the database should is a business
  decision.
- **Function definitions are spread across migrations.** `undo_member_sign_in`
  now has six versions, and finding the live one means finding the latest. A
  short index in CLAUDE.md, or a checked-in schema dump, would help.
- **Foreign keys without indexes** (`created_by`, `recorded_by`,
  `counterparty_principal_id`) would only cost anything if a principal were
  deleted, and RESTRICT prevents that.
- **The sync loads every existing principal and member** with `select('*')` and
  no paging, so it would be cut off past 1000 members. The club has 314.

## What stood up

- **Concurrent ticks.** Two simultaneous ticks for the same runner queue on
  the unique index. The second does nothing, then reads the committed row,
  because each statement sees committed data. Idempotency holds under
  concurrency, not just on retry.
- **Writes to the people tables are now tight.** After `0016`, `0018` and
  `0019`, the anon key can't write to `principals` or `members`, and can't
  remove a charged sign-in without its refund. B1's four tables are what's
  left.
- **Admin writes still go through the service role**, with every rule in a
  `lib/` module that's unit tested without a database.
- **Every function written this session** pins its search path and guards with
  `IS NOT TRUE`.
- **The ledger's constraints:** the sign CHECK, the counterparty CHECK,
  append-only, and the delete trigger. Each refuses a malformed row in the
  database itself, whoever wrote it.
