// Post-build hook: prepares the dist/ directory for `wrangler deploy`.
//
// Astro's Cloudflare adapter writes the Worker bundle to `dist/_worker.js/`
// and the static assets alongside it in `dist/`. When wrangler uploads `dist/`
// as the [assets] directory, it refuses to ship `_worker.js` as a public asset
// (which would expose server code). The fix is to add a `.assetsignore` file
// in `dist/` listing `_worker.js`.
//
// Reference:
//   https://developers.cloudflare.com/workers/static-assets/binding/#ignoring-assets

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, '..', 'dist');

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

const ignoreFile = join(distDir, '.assetsignore');
const contents = ['_worker.js', '_routes.json'].join('\n') + '\n';
writeFileSync(ignoreFile, contents, 'utf8');
console.log(`[post-build] wrote ${ignoreFile}`);
