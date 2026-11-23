# Omagh Harriers AC — Website

[omaghharriers.com](https://omaghharriers.com) — the club website, the
members' area, the admin area and the registrar app used at training.

## Stack

- **Framework**: Astro 5, server-rendered (`@astrojs/cloudflare`), Tailwind v4
- **Hosting**: Cloudflare Pages; every push to `main` deploys
- **Auth & DB**: Supabase (Postgres with RLS, magic link, Google and Microsoft sign-in)
- **Registrar app**: a React island at `/registrar/`, installable as a PWA, with an offline write queue and a service worker
- **Tests**: Vitest, beside the modules they test
- **Monorepo**: pnpm workspace with one app, `apps/site`

## Getting started

```sh
pnpm install
cp apps/site/.env.example apps/site/.env   # then fill in the Supabase keys
pnpm dev                                   # localhost:4321
```

Turnstile keys are optional in development; without them the sign-in check is skipped.

## Commands

Run from the repo root.

| Command | What it does |
| :--- | :--- |
| `pnpm dev` | Dev server at `localhost:4321` |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm typecheck` | `astro check`, including the hand-written database types against the schema |
| `pnpm build` | Production build |
| `pnpm sync-klubfunder <csv> [--apply]` | Reconcile members from a Klubfunder export (dry run without `--apply`) |
| `pnpm --filter @omagh/site supabase:types` | Regenerate `generated-types.ts` after a migration |

Don't run a build while the dev server is up: they share Vite's dependency
cache, and the dev server starts serving blank pages. Restart it if that
happens.

## Where things are

| Path | What |
| :--- | :--- |
| `apps/site/src/pages/` | Routes: the public site, `members/`, `admin/`, `registrar/`, `signin/` |
| `apps/site/src/lib/` | Every rule, unit tested without a database: `credits/`, `training/`, `reports/`, `auth/`, `sync/`, `http/`, `supabase/` |
| `apps/site/src/components/registrar/` | The registrar app's React island |
| `apps/site/src/data/training-schedule.ts` | Published training times |
| `apps/site/public/registrar/` | The app's service worker, manifest and icons |
| `apps/site/scripts/` | The Klubfunder sync CLI |
| `supabase/migrations/` | The schema, as numbered migrations |
| `supabase/scripts/` | One-off SQL: removing test data, clearing it at go-live |
| `roadmap/` | The plan, and every review in `roadmap/reviews/` |

## Docs

- **`CLAUDE.md`** — why things are the way they are: the registrar app, the ledger, roles, RLS, and the traps
- **`OPERATIONS.md`** — every dashboard setting, applying a migration, what to do when a training night goes wrong
- **`roadmap/members_area_implementation_plan.md`** — what's built, phase by phase

## WIP feature flag

Some pages are hidden from the nav in production while in progress. They are visible in dev automatically.

To toggle in a production or staging environment, open the browser console and call:

```js
wipNav.enable()   // show WIP nav items (persists across reloads)
wipNav.disable()  // hide them
wipNav.reset()    // revert to the build-time default
```

The flag has no effect on the pages themselves — direct URLs always work regardless.
