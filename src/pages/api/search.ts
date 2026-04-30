import type { APIRoute } from 'astro';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { createDb } from '~/db/client';
import { articles } from '~/db/schema';
import { json } from '~/lib/api-response';

export const prerender = false;

/**
 * GET /api/search?q=termo&page=1&limit=10
 *
 * Public endpoint used by the search island on the homepage. LIKE-based search
 * across title, summary and content. Sufficient for thousands of articles; when
 * the corpus grows past ~20k we should switch to D1 FTS5 or Vectorize.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env;
  const db = createDb(env.DB);

  const rawQ = url.searchParams.get('q')?.trim() ?? '';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? '10')));
  const offset = (page - 1) * limit;

  if (rawQ.length < 2) {
    return json({ items: [], total: 0, page, limit, q: rawQ });
  }

  // Escape LIKE wildcards in user input.
  const safe = rawQ.replace(/[\\%_]/g, (m) => `\\${m}`);
  const needle = `%${safe}%`;

  const where = and(
    eq(articles.status, 'published'),
    or(
      like(articles.title, needle),
      like(articles.summary, needle),
      like(articles.content, needle),
    ),
  );

  const [items, totalRow] = await Promise.all([
    db
      .select({
        slug: articles.slug,
        title: articles.title,
        summary: articles.summary,
        category: articles.category,
        published_at: articles.published_at,
      })
      .from(articles)
      .where(where)
      .orderBy(desc(articles.published_at))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(articles).where(where),
  ]);

  return json(
    {
      items,
      total: totalRow[0]?.count ?? 0,
      page,
      limit,
      q: rawQ,
    },
    {
      headers: {
        // Public endpoint — short edge cache for repeated queries.
        'Cache-Control': 'public, max-age=60',
      },
    },
  );
};
