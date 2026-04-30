// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import preact from '@astrojs/preact';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  integrations: [
    preact({ compat: false }),
    tailwind({ applyBaseStyles: false }),
  ],
  site: process.env.SITE_HOST || 'https://example.com',
  base: '/blog',
  trailingSlash: 'ignore',
  // The /api/* surface is a JSON API authenticated via Bearer token, called
  // from automation scripts (no browser Origin). Astro's same-origin POST check
  // would reject those calls, so we turn it off and rely on the Bearer middleware.
  security: {
    checkOrigin: false,
  },
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    ssr: {
      // Drizzle ORM needs to be external on workers runtime
      external: ['node:async_hooks'],
    },
  },
});
