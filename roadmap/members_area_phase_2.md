# Phase 2 — Auth: Magic Link + Principals & Members

Breaks the Phase 2 work in `members_area_implementation_plan.md` into shippable PRs. Each PR leaves the site in a working state, even if some pieces of the user journey aren't wired up yet.

PRs land in order — later ones depend on earlier schema/helpers. Phase 3 (OAuth) is a follow-on once these have landed.

## Data model — principals vs members

The Klubfunder export keys everything off a single contact email per member, which in practice is the **household** email — shared between siblings and (often) their adult parent. Two implications:

- One login per email, not per member. Whoever logs in sees and manages everyone associated with that email.
- A "member" (someone who attends training) might not be able to log in for themselves — most are juniors. Their parent signs in on their behalf.

This drives a two-table split:

- **`principals`** — who logs in. Keyed by email. One Supabase auth user per principal. Owns roles (`member` / `admin` / `superuser`), terms acceptance, and (in Phase 4) the credit balance.
- **`members`** — who attends training. Belongs to a principal. May or may not be the principal themselves.

A few examples:

- Lee Price (adult, runs solo) → 1 principal (`lp2382@gmail.com`) + 1 member (Lee).
- McCullagh family (Roisin + Martin + 2 kids on `rmccullagh@hotmail.com`) → 1 principal + 4 members.
- Daryl Armstrong (parent of two juniors, not himself a runner) → 1 principal (`darylarmstrong141@hotmail.com`) + 2 members (the kids). Daryl has no member row.
- A pure admin (system user, no involvement in the club as a runner) → 1 principal, 0 members. Rare but allowed.

Klubfunder-sourced principals always end up with ≥1 member; manually-added principals (admins) may have 0 members. We don't enforce this as a DB constraint — the sync logic and admin-add flow take care of the common cases.

---

## PR 1 — Supabase setup, schema & middleware skeleton

Wire up the Supabase project, create the `principals` and `members` tables, ship the auth helpers and a middleware skeleton. No user-facing flows yet — `/members/*` and `/admin/*` routes don't exist, so middleware has nothing to gate. Verifiable via build/typecheck and a Supabase dashboard check.

### Supabase project
- [x] Create a free Supabase project
- [x] Toggle **Allow new users to sign up** OFF in Auth settings (top-level, not per-provider)
- [x] Toggle **Link accounts with same email** in Auth settings
- [x] Add `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` to `apps/site/.env` (using the new `sb_publishable_...` key, not the legacy anon JWT)
- [x] Add `SUPABASE_SECRET_KEY` to `apps/site/.env` (the new `sb_secret_...` key — server-side only, never bundled into client code)
- [x] Add the same three env vars to Cloudflare Pages
- [ ] Customise auth email templates (magic link, OTP) with Omagh Harriers branding and sender name

### Schema (`supabase/migrations/`)
- [x] `0001_principals_and_members.sql`
  - `principals`: `id` (uuid PK), `email` (citext, UNIQUE, not null), `auth_user_id` (uuid, UNIQUE FK → `auth.users(id)`), `display_name` (text, not null), `role` (`'member' | 'admin' | 'superuser'`, default `'member'`), `is_active` (bool, default `true`), `source` (`'klubfunder' | 'manual'`, default `'manual'`), `terms_accepted_at`, `last_seen_in_klubfunder_at`, `created_at`, `updated_at`
  - `members`: `id` (uuid PK), `principal_id` (uuid, FK → `principals(id)`, not null), `first_name`, `surname`, `date_of_birth` (date, not null), `gender`, `athletic_association_number` (text, partial UNIQUE where not null), `status` (`'paid' | 'lapsed'`, default `'paid'`), `is_active` (bool, default `true`), `source` (`'klubfunder' | 'manual'`, default `'manual'`), `last_seen_in_klubfunder_at`, `created_at`, `updated_at`
  - `updated_at` trigger on both tables
- [x] `0002_rls_principals_and_members.sql` — enable RLS on both:
  - principals: a principal can `SELECT` their own row (`auth_user_id = auth.uid()`); admin/superuser can `SELECT/UPDATE/INSERT` any row
  - members: a principal can `SELECT` members where `principal_id = (their own principals.id)`; admin/superuser can `SELECT/UPDATE/INSERT` any row
  - service-role key bypasses RLS — used by the sync script (PR 2) and the admin-add endpoints (PR 4)
- [x] `0003_custom_access_token_hook.sql` — Postgres function that injects `role` from `principals` into the JWT on every token issue; grants and policies for `supabase_auth_admin`. Register the hook in Supabase Auth → Hooks (manual dashboard step).

### Code
- [x] `apps/site/src/lib/supabase/server.ts` — server client factory (cookie-bound for SSR session)
- [x] `apps/site/src/lib/supabase/browser.ts` — browser client factory
- [x] `apps/site/src/lib/supabase/types.ts` — Database types covering both tables (regenerate with `pnpm supabase:types` once the Supabase CLI is set up)
- [x] `apps/site/src/middleware.ts` — skeleton: lazily attach a Supabase server client to `Astro.locals.supabase`. **No redirects yet** — future PRs add gating once `/members` and `/admin` routes exist.

### Verification
- [x] `pnpm -r typecheck` and `pnpm -r build` pass
- [x] Migrations apply cleanly to the Supabase project (paste each SQL file into the SQL Editor in order)
- [x] Hook registered in Auth → Hooks → "Customize Access Token (JWT) Claims" → `public.custom_access_token_hook`
- [x] Manually create one auth user via the Supabase dashboard, insert a matching `principals` row with `role='admin'`, then sign in. Confirm the JWT includes `"role":"admin"`.

---

## PR 2 — Klubfunder sync script (initial seed + ongoing reconciliation)

A single script that handles both the **initial seed** (running against empty tables) and **ongoing weekly/monthly updates** (running against populated ones). Designed to be idempotent and diff-first: prints a plan, waits for `--apply` to mutate.

### Sync algorithm

The CSV has no stable per-row identifier. Matching is on natural keys:

- **Principals** match by `lower(email)`. One principal per unique email in the export.
- **Members** match by `(lower(first_name), lower(surname), date_of_birth)`. Spelling drift across exports (e.g. *Hannah* → *Hanah*) is allowed to create a new member row — historical attendance against the old spelling stays put. AAN is stored where present but not used for matching, since most members don't have one.
- **`display_name` for a principal**: take the most common non-empty `Parent or Guardian Full Name` across the principal's members. If all are empty (the email belongs to one or more adult members with no parent column filled), use `first_name + surname` of the alphabetically-first adult member.

### Architecture: pure core + thin wrappers

Sync logic lives in a pure core function so the same code can be driven from a CLI now and a drag-and-drop admin page later (Phase 4). The core takes a CSV string + the current DB state, returns a plan; a separate function applies the plan against a Supabase admin client.

- [x] **Pure core** at `apps/site/src/lib/sync/klubfunder.ts`:
  - `parseKlubfunderCSV(csv: string): KlubfunderRow[]` — parses, validates, normalises (trim + lowercase emails)
  - `computePlan(rows, existing, now): SyncPlan` — pure function, no IO, fully unit-testable
  - `applyPlan(plan, supabase): Promise<ApplyResult>` — does the IO
  - `describePlan(plan): string` — human-readable summary for CLI/UI
- [x] **Service-role client** at `apps/site/src/lib/supabase/admin.ts` — separate from the SSR client; uses `SUPABASE_SECRET_KEY` and bypasses RLS
- [x] **Unit tests** at `apps/site/src/lib/sync/klubfunder.test.ts` covering `parseKlubfunderCSV`, `computePlan` (add / reactivate / move / lapse cases), and `display_name` derivation. Vitest set up at the workspace level.

### CLI wrapper: `apps/site/scripts/sync-klubfunder.ts`
- [x] Reads a CSV path from CLI args: `pnpm sync-klubfunder <csv-path> [--apply]`
- [x] Loads `SUPABASE_SECRET_KEY` from `apps/site/.env`
- [x] Reads CSV → calls `parseKlubfunderCSV`
- [x] Loads existing principals + members → calls `computePlan`
- [x] Prints `describePlan` to stdout
- [x] If `--apply`: calls `applyPlan` and prints the result summary
- [x] Columns the parser uses: `First Name`, `Surname`, `Date of Birth`, `Select gender`, `Athletic Association Number`, `Parent or Guardian Full Name`, `Parent or Guardian Email`, `Status`. Everything else is ignored.

### Diff rules
  - **Principals**:
    - **Add** — new emails in the export → create auth user + principals row (`source='klubfunder'`)
    - **Reactivate** — existing principal currently `is_active=false` reappears → `is_active=true`, unban auth user
    - **Update** — `display_name` changed (e.g. parent of record updated) → update
    - **Lapse** — `source='klubfunder'` and `is_active=true` but absent from the export AND has no remaining active members → `is_active=false`, ban auth user
    - **Skip** — `source='manual'` (admin-added principals are never lapsed)
  - **Members**:
    - **Add** — name+DOB not found → insert with `principal_id` resolved from email, `source='klubfunder'`
    - **Move** — name+DOB found but principal email differs from current `principal_id` → update `principal_id` to the new principal
    - **Reactivate** — `is_active=false` and reappears → `is_active=true`, `status='paid'`
    - **Update** — `status` (paid/lapsed), `gender`, or `athletic_association_number` changed → update
    - **Lapse** — `source='klubfunder'`, `is_active=true`, absent from the export → `is_active=false`, `status='lapsed'`
    - **Skip** — `source='manual'`
### Apply behaviour
- [x] **Add principal**: `auth.admin.createUser({ email, email_confirm: true })`, then insert principals row
- [x] **Reactivate principal**: `is_active=true`, `auth.admin.updateUserById(id, { ban_duration: 'none' })`, refresh `last_seen_in_klubfunder_at`
- [x] **Lapse principal**: `is_active=false`, `auth.admin.updateUserById(id, { ban_duration: '876000h' })` (≈100 years)
- [x] **Add/move/reactivate/lapse member**: row updates only — members don't have auth users
- [x] **Order**: principals (add → reactivate → update) → members (add → move → reactivate → update → lapse) → principals (lapse). Lapsing principals last so they're not memberless mid-flight.
- [x] **Never deletes rows** — lapsed records are preserved so credit/attendance history (Phases 4–5) stays intact

### Initial seed
- [x] Drop the latest Klubfunder export at a known path (e.g. `~/Downloads/members.csv`)
- [x] Run `pnpm sync-klubfunder <csv-path>` (dry run); review the plan
- [x] Run `pnpm sync-klubfunder <csv-path> --apply`
- [ ] In the Supabase dashboard, manually promote a small number of principals to `admin` and one or two to `superuser` (the script never sets roles other than `'member'`)

### Documentation
- [x] Add a section to `CLAUDE.md` documenting the sync workflow: where to drop the CSV, how to run dry-run vs apply, and what each action means

### Verification
- [x] Dry run against empty tables prints `Add N principals` (one per unique email) and `Add M members` (one per row)
- [x] `--apply` against empty tables seeds principals + members; second run is a no-op (idempotent)
- [x] Remove one member row from the CSV, re-run with `--apply` → that member is lapsed; if it was the principal's last active member AND the email is also gone, principal is lapsed too *(covered by unit tests)*
- [x] Re-add the row, re-run with `--apply` → both reactivate *(covered by unit tests)*
- [x] Manually add a principal via the dashboard with `source='manual'`; run sync → that principal is **not** lapsed even though absent from the CSV *(covered by unit tests + verified in apply: existing manual admin untouched)*
- [x] Change a member's contact email in the CSV (move them to a different principal) → sync moves their `principal_id` *(covered by unit tests)*

### Open questions (resolve when we hit them)
- [ ] If a member has been manually deactivated by an admin (PR 4 admin UI) and then reappears in a Klubfunder export, should sync reactivate them or respect the manual deactivation? Suggest: respect manual — add a `manually_deactivated_at` timestamp; sync skips reactivation when set.
- [ ] If a whole family's email changes in Klubfunder (e.g. `rmccullagh@hotmail.com` → `roisin.mccullagh@hotmail.com`), the credit balance is stranded on the old (now memberless) principal. **Decided**: handled manually by an admin via a credit-transfer feature — defer to Phase 4.

---

## PR 3 — Sign-in flow & members landing

User-facing auth: principals can sign in via magic link, accept T&Cs on first sign-in, and land on a gated `/members` page that shows their household. Requires PR 2 to have seeded data — otherwise there's nothing to test against.

### Pages
- [ ] `apps/site/src/pages/signin.astro` — email input form; calls `supabase.auth.signInWithOtp()`; surfaces non-allowlisted email rejection as an explicit *"this email isn't on our member list — please contact the committee"* message
- [ ] Add Turnstile CAPTCHA on the signin form
- [ ] `apps/site/src/pages/signin/callback.astro` — exchanges the magic link token for a session cookie, then redirects to `/signin/terms` (if `principals.terms_accepted_at IS NULL`) or `/members`
- [ ] `apps/site/src/pages/signin/terms.astro` — first-sign-in T&Cs acceptance page; on accept, writes `principals.terms_accepted_at = now()` and redirects to `/members`
- [ ] `apps/site/src/pages/terms.astro` — public T&Cs (placeholder copy is fine for now; final wording is a separate task)
- [ ] `apps/site/src/pages/privacy.astro` — public privacy notice describing what data is held and that deletion requests go to admins
- [ ] `apps/site/src/pages/members/index.astro` — basic gated landing page showing the principal's display name and the list of members they manage; sign-out button

### Middleware
- [ ] Extend `apps/site/src/middleware.ts` (skeleton from PR 1):
  - Intercept `/members/*`: redirect to `/signin` if no session or no matching `principals` row
  - After auth check on `/members/*`, redirect to `/signin/terms` if `terms_accepted_at IS NULL` (except for `/signin/terms` itself)

### Nav
- [ ] Add a Members link to the site nav; renders as "Sign in" when unauthenticated and "Members area" when authenticated

### Verification
- [ ] Allowlisted email receives magic link and lands on `/members` (after first-time T&Cs acceptance), seeing all the members linked to their principal
- [ ] Non-allowlisted email gets the explicit "not on member list" message
- [ ] First sign-in is gated by `/signin/terms`; second sign-in skips it
- [ ] Sign-out clears the session and `/members` redirects to `/signin`

---

## PR 4 — Admin UI for principals & members

Admin tooling for the cases the Klubfunder sync doesn't cover: ad-hoc additions, manual deactivations, role promotions, and viewing the membership at a glance. Two list views with cross-links, since each table answers different operational questions.

### Pages
- [ ] `apps/site/src/pages/admin/principals.astro` — list principals (display_name, email, role, is_active, source, member count). Click through to a principal detail page showing all members under them.
- [ ] `apps/site/src/pages/admin/principals/[id].astro` — principal detail: edit display_name, deactivate, promote/demote role (latter restricted per role rules below). Shows their members and links to each.
- [ ] `apps/site/src/pages/admin/members.astro` — list all members (name, DOB, principal email, status, is_active, source). Click through to a member detail page.
- [ ] `apps/site/src/pages/admin/members/[id].astro` — member detail: edit attributes, deactivate, link to their principal.
- [ ] **Add principal** flow (admin form): email + display_name → server-side endpoint calls Supabase Admin API to create the auth user → inserts `principals` row with `source='manual'`, `role='member'`. Adding a member at the same time is optional (an admin without members is allowed).
- [ ] **Add member** flow: select a principal → enter first_name, surname, DOB, optional gender/AAN → insert with `source='manual'`.
- [ ] **Deactivate principal** flow: sets `is_active=false` and bans the Supabase auth user.
- [ ] **Deactivate member** flow: sets `is_active=false`. Doesn't touch any auth state.
- [ ] **Role changes** are scoped per role rules: admin/superuser can promote a principal between `member` and `admin`; only superusers can promote/demote the `superuser` role. Implement via a SECURITY DEFINER RPC (PostgreSQL RLS can't restrict per-column updates).

### Middleware
- [ ] Extend middleware to gate `/admin/*` to `auth.jwt() ->> 'role' IN ('admin', 'superuser')`; redirect non-admins to `/members` with a flash message.

### Verification
- [ ] Admin adds a new principal → that email can immediately sign in via magic link
- [ ] Admin adds a member under an existing principal → it appears in the principal's `/members` view
- [ ] Admin deactivates a principal → that email can no longer sign in
- [ ] A non-superuser admin cannot promote anyone to `superuser`
- [ ] Manually-added principals/members have `source='manual'` and are **not** lapsed by the next Klubfunder sync
