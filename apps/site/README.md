# @omagh/site

The Omagh Harriers AC public website — Astro static site deployed to Cloudflare Pages at [omaghharriers.com](https://omaghharriers.com).

This is one app in the `omagh-harriers` pnpm workspace. See the repo root for the workspace layout.

## Commands

Run from the repo root:

| Command | Action |
| :--- | :--- |
| `pnpm install` | Install all workspace dependencies |
| `pnpm dev` | Start the site dev server at `localhost:4321` |
| `pnpm build` | Build all workspace apps |
| `pnpm typecheck` | Run `astro check` across the workspace |

To target this app specifically:

```sh
pnpm --filter @omagh/site dev
pnpm --filter @omagh/site build
pnpm --filter @omagh/site typecheck
```

## Layout

- `src/pages/` — Astro routes (each `.astro` file is a page).
- `src/layouts/` — shared page layouts.
- `src/styles/` — global CSS (Tailwind v4 via `@tailwindcss/vite`).
- `public/` — static assets served as-is, including `_headers` for Cloudflare Pages cache rules.

## Deployment

Cloudflare Pages is configured with **Root directory** set to `apps/site`. Every push to `main` triggers a build and global CDN deploy. PRs get preview URLs automatically.
