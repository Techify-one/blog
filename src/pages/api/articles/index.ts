import type { APIRoute } from 'astro';
import { ulid } from 'ulid';
import { and, desc, eq, sql } from 'drizzle-orm';
import { createDb } from '~/db/client';
import { articles } from '~/db/schema';
import { isReservedSlug, slugify, uniqueSlug } from '~/lib/slug';
import { validateCreate } from '~/lib/article-input';
import { badRequest, json, methodNotAllowed, serverError } from '~/lib/api-response';
import { computeReadingTime } from '~/lib/structured-data';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env;
  const db = createDb(env.DB);

  const status = url.searchParams.get('status'); // optional: draft|published
  const category = url.searchParams.get('category');
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '20')));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status === 'draft' || status === 'published') {
    conditions.push(eq(articles.status, status));
  }
  if (category) {
    conditions.push(eq(articles.category, category));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, totalRow] = await Promise.all([
    db
      .select()
      .from(articles)
      .where(where)
      .orderBy(desc(articles.created_at))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(articles)
      .where(where),
  ]);

  return json({
    items,
    page,
    limit,
    total: totalRow[0]?.count ?? 0,
  });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const env = locals.runtime.env;
  const db = createDb(env.DB);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid JSON body');
  }

  const parsed = validateCreate(body);
  if (!parsed.ok || !parsed.value) {
    return badRequest('validation failed', parsed.errors);
  }
  const input = parsed.value;

  const baseSlug = input.slug ? slugify(input.slug) : slugify(input.title);
  if (!baseSlug) return badRequest('could not derive a slug from title');
  if (isReservedSlug(baseSlug, env.INDEXNOW_KEY)) {
    return badRequest(
      `slug "${baseSlug}" is reserved (collides with a blog route). Pick a different title or pass an explicit slug.`,
    );
  }

  const slug = await uniqueSlug(baseSlug, async (candidate) => {
    const row = await db
      .select({ slug: articles.slug })
      .from(articles)
      .where(eq(articles.slug, candidate))
      .limit(1);
    return row.length > 0;
  });

  const now = new Date().toISOString();
  const id = ulid();

  try {
    await db.insert(articles).values({
      id,
      slug,
      title: input.title,
      meta_title: input.meta_title ?? null,
      meta_description: input.meta_description ?? null,
      summary: input.summary,
      content: input.content,
      category: input.category ?? null,
      tags: input.tags ?? [],
      author_name: input.author_name ?? env.DEFAULT_AUTHOR_NAME,
      author_url: input.author_url ?? env.DEFAULT_AUTHOR_URL,
      status: 'draft',
      published_at: null,
      updated_at: now,
      created_at: now,
      indexnow_sent: 0,
      hero_image_url: input.hero_image_url ?? null,
      key_takeaways: input.key_takeaways ?? null,
      faq: input.faq ?? null,
      reading_time_min: computeReadingTime(input.content),
      aggregate_rating: input.aggregate_rating ?? null,
    });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : String(err));
  }

  const created = await db
    .select()
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1);

  return json({ article: created[0] }, { status: 201 });
};

export const ALL: APIRoute = () => methodNotAllowed(['GET', 'POST']);
