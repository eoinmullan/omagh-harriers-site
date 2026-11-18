// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  // React is here for one thing: the registrar island on /registrar. Every other
  // page ships no JavaScript and should stay that way.
  integrations: [react()],
  security: {
    checkOrigin: true,
  },
  vite: {
    plugins: [tailwindcss()]
  }
});