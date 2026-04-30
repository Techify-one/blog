import type { APIRoute } from 'astro';
import { desc, eq } from 'drizzle-orm';
import { createDb } from '~/db/client';
import { articles, categories } from '~/db/schema';

export const prerender = false;

function escape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env;
  const siteUrl = env.SITE_URL.replace(/\/$/, '');
  const db = createDb(env.DB);

  const [allArticles, allCategories] = await Promise.all([
    db
      .select({
        slug: articles.slug,
        category: articles.category,
        updated_at: articles.updated_at,
        published_at: articles.published_at,
      })
      .from(articles)
      .where(eq(articles.status, 'published'))
      .orderBy(desc(articles.published_at)),
    db.select({ slug: categories.slug }).from(categories),
  ]);

  const now = new Date().toISOString();

  const articleLastmod = (a: { updated_at: string | null; published_at: string | null }) =>
    a.updated_at ?? a.published_at ?? now;

  const maxLastmod = (items: { updated_at: string | null; published_at: string | null }[]) =>
    items.reduce<string | null>((max, a) => {
      const lm = articleLastmod(a);
      return max === null || lm > max ? lm : max;
    }, null);

  const homeLastmod = maxLastmod(allArticles) ?? now;

  const urls: { loc: string; lastmod: string; changefreq: string; priority: string }[] = [
    { loc: siteUrl, lastmod: homeLastmod, changefreq: 'daily', priority: '1.0' },
  ];

  for (const cat of allCategories) {
    const catArticles = allArticles.filter((a) => a.category === cat.slug);
    const catLastmod = maxLastmod(catArticles) ?? now;
    urls.push({
      loc: `${siteUrl}/categoria/${cat.slug}`,
      lastmod: catLastmod,
      changefreq: 'weekly',
      priority: '0.7',
    });
  }

  for (const a of allArticles) {
    urls.push({
      loc: `${siteUrl}/${a.slug}`,
      lastmod: articleLastmod(a),
      changefreq: 'monthly',
      priority: '0.8',
    });
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n` +
          `    <loc>${escape(u.loc)}</loc>\n` +
          `    <lastmod>${escape(u.lastmod)}</lastmod>\n` +
          `    <changefreq>${u.changefreq}</changefreq>\n` +
          `    <priority>${u.priority}</priority>\n` +
          `  </url>`,
      )
      .join('\n') +
    `\n</urlset>\n`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
