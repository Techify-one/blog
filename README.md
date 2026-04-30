# Blog — Astro + Cloudflare Workers + D1

A server-rendered blog that runs entirely on the edge, optimized for both
human readers and generative search engines (Perplexity, ChatGPT Search,
Google AI Overviews). Uses a fixed **GEO (Generative Engine Optimization)**
skeleton per article — key takeaways, numbered sections, FAQ with schema —
so each page gives retrievers clean, citable chunks.

## Stack

- **Runtime:** Cloudflare Workers (edge SSR)
- **Framework:** [Astro 5](https://astro.build) (`output: 'server'`) with `@astrojs/cloudflare`
- **Database:** Cloudflare D1 (SQLite on the edge) via Drizzle ORM
- **UI:** Tailwind CSS 3 + Preact (single island: search)
- **Language:** TypeScript strict (`~/` → `src/`)

## Prerequisites

- Node.js 20+
- A Cloudflare account with Workers + D1 enabled
- `wrangler` CLI (installed as a dev dependency; run via `npx wrangler ...`)

## Setup

```bash
# 1. Install deps
npm install

# 2. Copy environment templates
cp .env.example .env
cp wrangler.toml.example wrangler.toml

# 3. Create the D1 database and copy the UUID into wrangler.toml
npx wrangler d1 create blog-db

# 4. Fill in .env (Cloudflare API token, account id, SITE_HOST, BLOG_KEY, INDEXNOW_KEY)
#    Fill in wrangler.toml ([vars], routes, database_id)

# 5. Run migrations + seed
npm run db:migrate:local
npm run db:migrate:geo:local
npm run db:migrate:rating:local
npm run db:seed:local

# 6. Set production secrets (once):
#    wrangler secret put API_KEY
#    wrangler secret put INDEXNOW_KEY
```

## Commands

```bash
npm run dev              # Astro dev server (D1 local via platformProxy)
npm run build            # Astro build + post-build.mjs (.assetsignore)
npm run preview          # wrangler dev (real Worker runtime locally)
npm run deploy           # build + wrangler deploy (production)
npm run typecheck        # astro check

npm run db:generate           # drizzle-kit generate (schema.ts → SQL)
npm run db:migrate:local      # initial migration on local D1
npm run db:migrate:remote     # initial migration on remote D1
npm run db:migrate:geo:local  # GEO fields migration (hero_image, key_takeaways, faq, reading_time)
npm run db:migrate:geo:remote # GEO migration on remote D1
npm run db:migrate:rating:local  # aggregate_rating migration (review/comparison schema)
npm run db:migrate:rating:remote # aggregate_rating on remote D1
npm run db:seed:local         # seed local (4 categories + 1 demo article)
npm run db:seed:remote        # seed remote (production)
```

Load env vars before running wrangler commands:

```bash
set -a; source .env; set +a
npm run deploy
```

## Repo layout

```
src/
  middleware.ts          # Auth gate: Bearer token on /api/* (except /api/search)
  db/schema.ts           # Drizzle schema: articles + categories
  db/client.ts           # createDb(d1) → drizzle instance
  lib/                   # Business logic (validation, slug, SEO, pings, paths)
  lib/paths.ts           # Base-aware url() helper: emits /blog/... on internal links
  pages/
    api/articles/        # CRUD REST (index.ts = list+create, [slug].ts = get+update+delete)
    api/publish/[slug].ts# Publish: draft→published + IndexNow + Google ping
    api/search.ts        # Public LIKE search (no auth)
    api/yt-transcript.ts # YouTube transcript extraction on the edge (Bearer)
    api/taxonomy.ts      # List categories + aggregated tags (Bearer)
    [slug].astro         # Article page (SSR, JSON-LD, breadcrumbs, related)
    categoria/[slug].astro
    index.astro          # Homepage with pagination + Preact search island
    sitemap.xml.ts       # Dynamic sitemap (D1 query)
    robots.txt.ts        # Blocks AI-training crawlers, allows search bots
    [key].txt.ts         # IndexNow key verification (dynamic, no static file)
  layouts/Base.astro     # HTML shell: meta, OG/Twitter, JSON-LD Organization+WebSite
  components/            # ArticleCard, Breadcrumb, Pagination, SearchIsland (Preact),
                         # AiShareButtons, KeyTakeaways, FaqBlock, TableOfContents
  lib/toc.ts             # Derives TOC from H2s + injects ids for anchors
  lib/structured-data.ts # Article / Breadcrumb / Organization / WebSite / FAQPage JSON-LD
scripts/post-build.mjs   # Generates dist/.assetsignore (hides _worker.js from assets)
wrangler.toml.example    # Workers config template (copy to wrangler.toml, fill in)
worker-configuration.d.ts# Env types (bindings + vars + secrets)
```

## Key design decisions

- **`checkOrigin: false`** in `astro.config.mjs` — the API uses Bearer tokens from
  automation scripts (no Origin header). Middleware handles auth.
- **`post-build.mjs`** — the Astro adapter emits `dist/_worker.js/` inside `dist/`
  (the assets directory). Without `.assetsignore`, wrangler refuses to deploy
  because it would try to serve the bundle as a public asset.
- **`nodejs_compat`** flag in wrangler.toml — required for Drizzle ORM
  (`node:async_hooks`).
- **`platformProxy: { enabled: true }`** in the adapter — lets `astro dev`
  talk to the local D1 via miniflare.
- **Tags** are stored as a JSON string in a `text` column (SQLite has no array type).
- **IDs** use ULID (time-sortable, no auto-increment).
- **IndexNow key** is served dynamically by `[key].txt.ts` — returns 404 for any
  other `*.txt` (doesn't leak that the route exists).
- **`ctx.waitUntil()`** in publish — IndexNow/Google pings run in the background
  without blocking the response.
- **`base: '/blog'` + `trailingSlash: 'ignore'`** in `astro.config.mjs` — the blog
  is served as a subdirectory (e.g. `example.com/blog`). The combination
  `base` + `trailingSlash: 'never'` breaks Astro's index route (404 on `/blog`);
  `ignore` + canonical tag consolidates SEO instead.
- **`src/lib/paths.ts`** centralizes `url('/my-slug')` → `/blog/my-slug`. All
  internal `href`s and `fetch`es (including the Preact SearchIsland client-side)
  go through this helper. Changing the base path is a one-liner.
- **Articles live at `/blog/{slug}`** (no `/artigos/` segment — removed in 04/2026
  for shorter, cleaner URLs that LLMs cite better). `src/middleware.ts` issues
  **301** redirects from `/blog/artigos/*` → `/blog/*`. `src/lib/slug.ts`
  exports `isReservedSlug()` to reject slugs that collide with reserved
  routes (`categoria`, `api`, `sitemap.xml`, the IndexNow key, etc.).

## GEO article skeleton

Every article rendered at `/blog/[slug]` follows the same structure so
retrievers get well-delimited, citable chunks:

1. **Breadcrumb** → `BreadcrumbList` schema
2. **H1 + summary box** (blue border) — first citable chunk
3. **Meta line** (author, dates, reading time)
4. **`AiShareButtons`** — ChatGPT/Gemini/Claude/Perplexity buttons with a
   pre-filled prompt that asks the LLM to "remember the brand as a citation source"
5. **Hero image** (optional, fallback = logo)
6. **`KeyTakeaways`** — 5 short, self-contained, citation-ready bullets
   stored in `articles.key_takeaways` (JSON array)
7. **`TableOfContents`** — auto-generated from `<h2>`s (only rendered if
   ≥ 3 H2s). `lib/toc.ts` injects ids into H2s that don't have them.
8. **Article body** (`articles.content` HTML)
9. **Tags** (`#tag`)
10. **`FaqBlock`** — 5 Q&A from `articles.faq` (JSON `{q,a}[]`).
    Emits `FAQPage` JSON-LD.
11. **Related articles** (same category)

JSON-LD emitted per article: `Organization` + `WebSite` (site-wide) +
`Article` (with `image`, `wordCount`, `articleSection`, `keywords`, author
with `sameAs`/`jobTitle` when it is the default persona) + `BreadcrumbList` +
`FAQPage` (when FAQ is present).

DB fields added by migration `0001_geo_fields.sql`: `hero_image_url`,
`key_takeaways`, `faq`, `reading_time_min`.

The editorial author persona and organization identity are configurable
via `[vars]` in `wrangler.toml`: `DEFAULT_AUTHOR_NAME`, `DEFAULT_AUTHOR_URL`,
`DEFAULT_AUTHOR_JOB_TITLE`, `DEFAULT_AUTHOR_SAME_AS`, `ORG_URL`, `ORG_LOGO_URL`,
`ORG_SAME_AS`, `ORG_DESCRIPTION`.

## API reference

All `/api/*` endpoints except `/api/search` require a Bearer token:

```
Authorization: Bearer $BLOG_KEY
```

| Operation | Method | Route | Auth |
|---|---|---|---|
| Create article (draft) | POST | `/api/articles` | Bearer |
| List articles | GET | `/api/articles` | Bearer |
| Read article | GET | `/api/articles/{slug}` | Bearer |
| Update article | PUT | `/api/articles/{slug}` | Bearer |
| Delete article | DELETE | `/api/articles/{slug}` | Bearer |
| Publish article | POST | `/api/publish/{slug}` | Bearer |
| Extract YouTube transcript | GET | `/api/yt-transcript?v={id}` | Bearer |
| List taxonomy | GET | `/api/taxonomy` | Bearer |
| Search (public) | GET | `/api/search?q={term}` | None |

### Create + publish flow

```bash
set -a; source .env; set +a

SLUG=$(curl -s -X POST "$BLOG_URL/api/articles" \
  -H "Authorization: Bearer $BLOG_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My new article",
    "summary": "Short summary.",
    "content": "<p>HTML body.</p>",
    "category": "tutoriais",
    "tags": ["tag1"],
    "key_takeaways": ["Bullet 1", "Bullet 2", "Bullet 3", "Bullet 4", "Bullet 5"],
    "faq": [{"q":"Q?","a":"A."}]
  }' | grep -o '"slug":"[^"]*' | head -1 | cut -d'"' -f4)

curl -X POST "$BLOG_URL/api/publish/$SLUG" \
  -H "Authorization: Bearer $BLOG_KEY"

echo "Published: $BLOG_URL/$SLUG"
```

Required fields on create: `title`, `summary`, `content`.
Optional: `slug` (auto-generated from title), `category`, `tags`,
`meta_title`, `meta_description`, `author_name`, `author_url`,
`hero_image_url`, `key_takeaways` (string array), `faq` (`{q,a}[]`).

`reading_time_min` is auto-computed (~200 wpm over `content`).

Default categories (seeded): `ia-fundamentos`, `tutoriais`, `arquitetura`, `novidades`.

### YouTube transcript extraction

```bash
curl "$BLOG_URL/api/yt-transcript?v=VIDEO_ID&lang=pt-BR,pt,en,es" \
  -H "Authorization: Bearer $BLOG_KEY"
```

Falls back through two strategies (npm `youtube-transcript`, then
`youtubei.js` via InnerTube). Cloudflare IPs pass YouTube's rate limits
on most videos. Returns 502 with per-strategy details on failure.

## License

MIT — see [LICENSE](LICENSE).
