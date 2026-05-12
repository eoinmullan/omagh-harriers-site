# Omagh Harriers AC — Website

[omaghharriers.com](https://omaghharriers.com) — club website and members' area.

## Stack

- **Framework**: Astro (SSR via `@astrojs/cloudflare`)
- **Hosting**: Cloudflare Pages
- **Auth & DB**: Supabase
- **Monorepo**: pnpm workspaces (`apps/site`)

## Development

```sh
pnpm install
pnpm dev          # start dev server
pnpm -r typecheck # type-check all packages
pnpm -r build     # build all packages
```

## WIP feature flag

Some pages are hidden from the nav in production while in progress. They are visible in dev automatically.

To toggle in a production or staging environment, open the browser console and call:

```js
wipNav.enable()   // show WIP nav items (persists across reloads)
wipNav.disable()  // hide them
wipNav.reset()    // revert to the build-time default
```

The flag has no effect on the pages themselves — direct URLs always work regardless.
