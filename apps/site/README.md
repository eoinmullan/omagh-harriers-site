# @omagh/site

The Omagh Harriers AC site: the public pages, the members' area, the admin
area and the registrar app, server-rendered by Astro on Cloudflare Pages at
[omaghharriers.com](https://omaghharriers.com).

The repo root's `README.md` has the commands and the map, and `CLAUDE.md` the
decisions behind them.

## Commands

Run from this directory, or from the root with `pnpm --filter @omagh/site <script>`.

| Script | What it does |
| :--- | :--- |
| `dev` | Dev server at `localhost:4321` |
| `test` | Vitest |
| `typecheck` | `astro check` |
| `build` | Production build |
| `build:deploy` | Typecheck, test, then build. What Cloudflare Pages runs |
| `supabase:types` | Regenerate `src/lib/supabase/generated-types.ts` from the live schema |
| `sync-klubfunder` | The Klubfunder sync CLI |

## Layout

- `src/pages/` — routes. Most are server-rendered; the privacy, terms, policies and half-marathon pages and `/registrar/` are prerendered.
- `src/layouts/` — `Layout.astro` for the site, `AdminLayout.astro` for `/admin`.
- `src/components/` — Astro components, plus `registrar/`, the React island.
- `src/lib/` — the rules, each with a `*.test.ts` beside it.
- `src/middleware.ts` — reads who is signed in and gates `/members` and `/admin`.
- `public/` — static assets, `_headers` for Cloudflare's cache rules, and `registrar/` for the app's worker, manifest and icons.

## Deployment

Cloudflare Pages, **Root directory** `apps/site`, build command
`pnpm build:deploy`. Every push to `main` deploys; a failing typecheck or
test fails the build and the previous deployment stays live. See
`OPERATIONS.md` for the rest.
