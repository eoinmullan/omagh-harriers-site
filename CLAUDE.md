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

The script always uses `source='klubfunder'` for the rows it creates and **never touches** rows tagged `source='manual'` (admin-added principals/members are immune from lapsing).

No emails are sent: auth users are created with `email_confirm: true`, which skips Supabase's confirmation-email step.
