import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { createDb } from '~/db/client';
import { articles } from '~/db/schema';
import { pingIndexNow } from '~/lib/indexnow';
import { pingGoogleSitemap } from '~/lib/ping-google';
import { badRequest, json, notFound, serverError } from '~/lib/api-response';

export const prerender = false;

/**
 * POST /api/publish/[slug]
 *
 * Flips an article from draft to published, then fires IndexNow + Google sitemap ping
 * in the background via ctx.waitUntil so the response returns immediately.
 *
 * Idempotent: re-publishing an already-published article still re-pings IndexNow
 * (useful after content updates).
 */
export const POST: APIRoute = async ({ locals, params }) => {
  const slug = params.slug;
  if (!slug) return badRequest('missing slug');

  const env = locals.runtime.env;
  const ctx = locals.runtime.ctx;
  const db = createDb(env.DB);

  const rows = await db
    .select()
    .from(articles)
    .where(eq(articles.slug, slug))
    .limit(1);
  if (rows.length === 0) return notFound('article not found');
  const article = rows[0]!;

  const now = new Date().toISOString();
  const wasAlreadyPublished = article.status === 'published';

  try {
    await db
      .update(articles)
      .set({
        status: 'published',
        published_at: wasAlreadyPublished ? article.published_at : now,
        updated_at: now,
        indexnow_sent: 1,
      })
      .where(eq(articles.id, article.id));
  } catch (err) {
    return serverError(err instanceof Error ? err.message : String(err));
  }

  const siteUrl = env.SITE_URL.replace(/\/$/, '');
  const articleUrl = `${siteUrl}/${article.slug}`;
  const host = new URL(siteUrl).host;
  const keyLocation = `${siteUrl}/${env.INDEXNOW_KEY}.txt`;

  // Fire pings in the background — do not block the response.
  const pings = Promise.allSettled([
    pingIndexNow(
      [articleUrl, siteUrl, `${siteUrl}/sitemap.xml`],
      host,
      env.INDEXNOW_KEY,
      keyLocation,
    ),
    pingGoogleSitemap(siteUrl),
  ]);
  if (ctx?.waitUntil) {
    ctx.waitUntil(pings);
  } else {
    // Local dev: just await so logs show.
    await pings;
  }

  return json({
    ok: true,
    url: articleUrl,
    slug: article.slug,
    status: 'published',
    republished: wasAlreadyPublished,
  });
};
