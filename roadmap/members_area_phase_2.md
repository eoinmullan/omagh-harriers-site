# Phase 2 — Auth: Magic Link + Members Table

Breaks the Phase 2 work in `members_area_implementation_plan.md` into shippable PRs. Each PR leaves the site in a working state, even if some pieces of the user journey aren't wired up yet.

PRs land in order — later ones depend on earlier schema/helpers. Phase 3 (OAuth) is a follow-on once these have landed.

---

## PR 1 — Supabase setup, schema & middleware skeleton

Wire up the Supabase project, create the `members` table, ship the auth helpers and a middleware skeleton. No user-facing flows yet — `/members/*` routes don't exist, so middleware has nothing to gate. Verifiable via build/typecheck and a Supabase dashboard check.

### Supabase project
- [ ] Create a free Supabase project
- [ ] Toggle **Disable new sign-ups** in Auth settings
- [ ] Toggle **Link accounts with same email** in Auth settings
- [ ] Add `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` to `apps/site/.env` and Cloudflare Pages env vars
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY` to `apps/site/.env` and Cloudflare Pages env vars (server-side only — never bundled into client code)
- [ ] Customise auth email templates (magic link, OTP) with Omagh Harriers branding and sender name

### Schema (`supabase/migrations/`)
- [ ] `0001_members.sql` — create `members` table:
  - `id` (uuid PK), `email` (citext, unique, not null), `name`, `phone`
  - `auth_user_id` (uuid, references `auth.users(id)`, unique)
  - `role` (`'member' | 'admin' | 'superuser'`, default `'member'`)
  - `is_active` (bool, default `true`)
  - `source` (`'klubfunder' | 'manual'`, default `'manual'`) — needed by the sync script in PR 2 so manually-added members aren't lapsed when they don't appear in a Klubfunder export
  - `klubfunder_member_id` (text, nullable, unique when not null) — stable identifier so email changes in Klubfunder don't look like delete-then-add
  - `terms_accepted_at` (timestamptz, nullable)
  - `last_seen_in_klubfunder_at` (timestamptz, nullable) — set by the sync script
  - `created_at`, `updated_at` (timestamptz, default `now()`)
- [ ] `0002_custom_access_token_hook.sql` — Postgres function that injects `role` from `members` into the JWT on every token issue; register it in Supabase Auth → Hooks
- [ ] `0003_rls_members.sql` — enable RLS; policies:
  - members can `SELECT` their own row (`auth_user_id = auth.uid()`)
  - admin-or-superuser can `SELECT/UPDATE/INSERT` any row (`auth.jwt() ->> 'role' IN ('admin', 'superuser')`)
  - superuser-only policy guards role changes to/from `superuser`

### Code
- [ ] `apps/site/src/lib/supabase/` — server client factory (using cookies for SSR session) and browser client factory
- [ ] `apps/site/src/lib/supabase/types.ts` — generated DB types (run `supabase gen types typescript`); committed and regenerated when schema changes
- [ ] `apps/site/src/middleware.ts` — skeleton: read Supabase session, attach to `Astro.locals.user` and `Astro.locals.member`; **no redirects yet** (no gated routes exist). Future PRs add the redirect rules.

### Verification
- [ ] `pnpm -r typecheck` and `pnpm -r build` pass
- [ ] Migrations apply cleanly to the Supabase project
- [ ] Manually create one auth user via the Supabase dashboard and a matching `members` row; confirm the JWT includes the `role` claim (Supabase dashboard → Authentication → Users → JWT)

---

## PR 2 — Klubfunder sync script (initial seed + ongoing reconciliation)

A single script that handles both the **initial seed** (running against an empty `members` table) and **ongoing weekly/monthly updates** (running against a populated one). Designed to be idempotent and diff-first: prints a plan, waits for `--apply` to mutate.

### Script: `scripts/sync-klubfunder.ts`
- [ ] Reads a CSV path from CLI args: `pnpm sync-klubfunder ./klubfunder-export.csv`
- [ ] Connects to Supabase using `SUPABASE_SERVICE_ROLE_KEY` (loaded from `apps/site/.env`)
- [ ] Parses the Klubfunder CSV — confirm the actual export columns once we have a real file; expected: member id, name, email, phone, status (active/lapsed/etc.)
- [ ] Lowercases and trims emails before comparison
- [ ] Computes a diff against the current `members` table:
  - **Add** — Klubfunder rows with no matching `klubfunder_member_id` and no matching email
  - **Reactivate** — existing rows currently `is_active = false` that reappear in the export
  - **Update** — existing rows with name/phone/email changes (matched by `klubfunder_member_id` first, falling back to email)
  - **Lapse** — existing rows where `source = 'klubfunder'` and `is_active = true` that are absent from the current export → set `is_active = false`
  - **Skip** — rows where `source = 'manual'` (admin-added, not Klubfunder-managed) are never lapsed by this script
- [ ] **Default mode (dry run)**: prints the plan grouped by action; exits without mutating
- [ ] **`--apply` flag**: executes the plan inside a single transaction where possible:
  - For **Add**: call Supabase Admin API `auth.admin.createUser({ email, email_confirm: true })`, then insert the `members` row with the returned `auth_user_id`, `source = 'klubfunder'`, and `klubfunder_member_id`
  - For **Reactivate**: set `is_active = true`, re-enable the auth user (`auth.admin.updateUserById(id, { ban_duration: 'none' })`), update `last_seen_in_klubfunder_at`
  - For **Update**: `UPDATE members SET ...` — name, phone, email; if email changed, also call `auth.admin.updateUserById` to keep the auth user's email in sync
  - For **Lapse**: set `is_active = false`, ban the auth user (`auth.admin.updateUserById(id, { ban_duration: '876000h' })`) so magic links stop working
- [ ] Writes a summary to stdout: counts per action, plus any rows that errored
- [ ] **Never deletes rows** — lapsed members are preserved so credit/attendance history (Phases 4–5) stays intact

### Initial seed
- [ ] Export current member list from Klubfunder as CSV
- [ ] Run `pnpm sync-klubfunder ./klubfunder-export.csv` (dry run); review the plan
- [ ] Run `pnpm sync-klubfunder ./klubfunder-export.csv --apply`
- [ ] In the Supabase dashboard, manually promote a small number of members to `admin` and one or two to `superuser` (the script never sets roles other than `'member'`)

### Documentation
- [ ] Add a section to `CLAUDE.md` (or `roadmap/`) documenting the sync workflow: where to drop the CSV, how to run dry-run vs apply, and what each action means

### Verification
- [ ] Dry run against an empty `members` table prints "Add N" matching the CSV row count
- [ ] `--apply` against an empty `members` table seeds members and creates auth users; second run is a no-op (idempotent)
- [ ] Remove one row from the CSV, re-run with `--apply` → that member is lapsed (`is_active = false`, auth user banned)
- [ ] Re-add the same row, re-run with `--apply` → that member is reactivated
- [ ] Manually add a member via Supabase dashboard with `source = 'manual'`; run sync → that member is **not** lapsed even though they're absent from the CSV

### Open questions (resolve when we have a real Klubfunder export)
- [ ] Confirm the actual CSV column names and whether Klubfunder exposes a stable member ID
- [ ] Decide whether Klubfunder's own `status` column should override (e.g. members marked "lapsed" in Klubfunder but still present in the export)
- [ ] If a member has been manually deactivated by an admin (Phase 2 admin UI, PR 4) and then reappears in a Klubfunder export, should sync reactivate them or respect the manual deactivation? Suggest: respect manual — track an `is_manually_deactivated` flag, or add a sentinel value on `source`

---

## PR 3 — Sign-in flow & members landing

User-facing auth: members can sign in via magic link, accept T&Cs on first sign-in, and land on a gated `/members` page. Requires PR 2 to have seeded data — otherwise there's nothing to test against.

### Pages
- [ ] `apps/site/src/pages/signin.astro` — email input form; calls `supabase.auth.signInWithOtp()`; surfaces non-allowlisted email rejection as an explicit *"this email isn't on our member list — please contact the committee"* message
- [ ] Add Turnstile CAPTCHA on the signin form
- [ ] `apps/site/src/pages/signin/callback.astro` — exchanges the magic link token for a session cookie, then redirects to `/signin/terms` (if `terms_accepted_at IS NULL`) or `/members`
- [ ] `apps/site/src/pages/signin/terms.astro` — first-sign-in T&Cs acceptance page; on accept, writes `members.terms_accepted_at = now()` and redirects to `/members`
- [ ] `apps/site/src/pages/terms.astro` — public T&Cs (placeholder copy is fine for now; final wording is a separate task)
- [ ] `apps/site/src/pages/privacy.astro` — public privacy notice describing what data is held and that deletion requests go to admins
- [ ] `apps/site/src/pages/members/index.astro` — basic gated landing page showing the member's name and a sign-out button

### Middleware
- [ ] Extend `apps/site/src/middleware.ts` (skeleton from PR 1):
  - Intercept `/members/*`: redirect to `/signin` if no session or no matching `members` row
  - After auth check on `/members/*`, redirect to `/signin/terms` if `terms_accepted_at IS NULL` (except for `/signin/terms` itself)

### Nav
- [ ] Add a Members link to the site nav; renders as "Sign in" when unauthenticated and "Members area" when authenticated

### Verification
- [ ] Allowlisted email receives magic link and lands on `/members` (after first-time T&Cs acceptance)
- [ ] Non-allowlisted email gets the explicit "not on member list" message
- [ ] First sign-in is gated by `/signin/terms`; second sign-in skips it
- [ ] Sign-out clears the session and `/members` redirects to `/signin`

---

## PR 4 — Admin members management UI

Admin tooling for the day-to-day cases the Klubfunder sync doesn't cover: ad-hoc additions, manual deactivations, and role promotions.

### Pages
- [ ] `apps/site/src/pages/admin/members.astro` — list members (name, email, role, is_active, source); add new member; deactivate existing member
- [ ] **Add member** flow: name + email + phone form → server-side endpoint calls Supabase Admin API to create the auth user → inserts `members` row with `source = 'manual'`, `role = 'member'`
- [ ] **Deactivate member** flow: sets `is_active = false` on the row and bans the Supabase auth user
- [ ] `apps/site/src/pages/admin/members/roles.astro` — superuser-only page to promote members between `member` and `admin`; promoting/demoting `superuser` is gated to existing superusers

### Middleware
- [ ] Extend middleware to gate `/admin/*` to `auth.jwt() ->> 'role' IN ('admin', 'superuser')`; redirect non-admins to `/members` with a flash message

### Verification
- [ ] Admin adds a new member → that email can immediately sign in via magic link
- [ ] Admin deactivates a member → that email can no longer sign in
- [ ] A non-superuser admin cannot access `/admin/members/roles`
- [ ] Manually-added member has `source = 'manual'` and is **not** lapsed by the next Klubfunder sync
