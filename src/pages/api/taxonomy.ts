import type { APIRoute } from 'astro';
import { eq, sql } from 'drizzle-orm';
import { createDb } from '~/db/client';
import { articles, categories } from '~/db/schema';
import { json } from '~/lib/api-response';

export const prerender = false;

/**
 * GET /api/taxonomy
 *
 * Returns the taxonomy in use: canonical categories (from the `categories`
 * table) with article counts, and all tags aggregated from the `articles`
 * table. Tiny payload — intended as a quick lookup before authoring new
 * articles to avoid creating duplicates like "cache" vs "caches".
 *
 * Query params:
 *   status=published   only count published articles (default: all)
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env;
  const db = createDb(env.DB);

  const status = url.searchParams.get('status');
  const onlyPublished = status === 'published';

  const categoryCounts = onlyPublished
    ? await db
        .select({
          slug: articles.category,
          count: sql<number>`count(*)`,
        })
        .from(articles)
        .where(eq(articles.status, 'published'))
        .groupBy(articles.category)
    : await db
        .select({
          slug: articles.category,
          count: sql<number>`count(*)`,
        })
        .from(articles)
        .groupBy(articles.category);

  const countBySlug = new Map<string, number>();
  for (const row of categoryCounts) {
    if (row.slug) countBySlug.set(row.slug, Number(row.count));
  }

  const cats = await db
    .select()
    .from(categories)
    .orderBy(categories.slug);

  const categoriesOut = cats.map((c) => ({
    slug: c.slug,
    name: c.name,
    count: countBySlug.get(c.slug) ?? 0,
  }));

  const tagRows = onlyPublished
    ? await db
        .select({ tags: articles.tags })
        .from(articles)
        .where(eq(articles.status, 'published'))
    : await db.select({ tags: articles.tags }).from(articles);

  const tagCount = new Map<string, number>();
  for (const row of tagRows) {
    const list = (row.tags as string[] | null) ?? [];
    for (const t of list) {
      tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    }
  }

  const tagsOut = Array.from(tagCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return json(
    { categories: categoriesOut, tags: tagsOut },
    { headers: { 'Cache-Control': 'private, max-age=30' } },
  );
};
