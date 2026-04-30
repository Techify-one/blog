// Cloudflare bindings and vars available to the Worker runtime.
// Referenced by tsconfig.json and used throughout src/lib and src/pages/api.

interface Env {
  // Bindings
  DB: D1Database;
  ASSETS: Fetcher;

  // Public vars (from wrangler.toml [vars])
  SITE_URL: string;
  SITE_NAME: string;
  SITE_DESCRIPTION: string;
  ORG_NAME?: string;
  ORG_URL: string;
  ORG_LOGO_URL: string;
  ORG_SAME_AS: string;
  ORG_DESCRIPTION: string;
  DEFAULT_AUTHOR_NAME: string;
  DEFAULT_AUTHOR_URL: string;
  DEFAULT_AUTHOR_JOB_TITLE: string;
  DEFAULT_AUTHOR_SAME_AS: string;
  DEFAULT_AUTHOR_BIO: string;
  DEFAULT_AUTHOR_AVATAR_URL: string;
  DEFAULT_AUTHOR_CREDENTIALS: string;
  DEFAULT_AUTHOR_KNOWS_ABOUT: string;
  ORG_KNOWS_ABOUT: string;
  DEFAULT_HERO_IMAGE_URL: string;

  // Secrets (from `wrangler secret put`)
  API_KEY: string;
  INDEXNOW_KEY: string;
}

declare namespace App {
  interface Locals {
    runtime: {
      env: Env;
      ctx: {
        waitUntil(promise: Promise<unknown>): void;
        passThroughOnException(): void;
      };
      cf?: IncomingRequestCfProperties;
    };
  }
}
