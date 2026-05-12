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
