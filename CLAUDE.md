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
