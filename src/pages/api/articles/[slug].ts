import type { APIRoute } from 'astro';
import { eq, and, ne } from 'drizzle-orm';
import { createDb } from '~/db/client';
import { articles } from '~/db/schema';
import { isReservedSlug, slugify, uniqueSlug } from '~/lib/slug';
import { validateUpdate } from '~/lib/article-input';
import { badRequest, json, notFound, serverError } from '~/lib/api-response';
import { computeReadingTime } from '~/lib/structured-data';

export const prerender = false;

export const GET: APIRoute = async ({ locals, params }) => {
  const slug = params.slug;
  if (!slug) return badRequest('missing slug');
  const db = createDb(locals.runtime.env.DB);

  const rows = await db
    .select()
    .from(articles)
    .where(eq(articles.slug, slug))
    .limit(1);

  if (rows.length === 0) return notFound('article not found');
  return json({ article: rows[0] });
};

export const PUT: APIRoute = async ({ locals, params, request }) => {
  const slug = params.slug;
  if (!slug) return badRequest('missing slug');
  const env = locals.runtime.env;
  const db = createDb(env.DB);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid JSON body');
  }
  const parsed = validateUpdate(body);
  if (!parsed.ok || !parsed.value) {
    return badRequest('validation failed', parsed.errors);
  }
  const input = parsed.value;

  const existing = await db
    .select()
    .from(articles)
    .where(eq(articles.slug, slug))
    .limit(1);
  if (existing.length === 0) return notFound('article not found');
  const current = existing[0]!;

  // Slug change is allowed but must remain unique. Skip the current row.
  let newSlug = current.slug;
  if (input.slug && input.slug !== current.slug) {
    const baseSlug = slugify(input.slug);
    if (!baseSlug) return badRequest('invalid slug');
    if (isReservedSlug(baseSlug, env.INDEXNOW_KEY)) {
      return badRequest(`slug "${baseSlug}" is reserved (collides with a blog route)`);
    }
    newSlug = await uniqueSlug(baseSlug, async (candidate) => {
      const row = await db
        .select({ slug: articles.slug })
        .from(articles)
        .where(and(eq(articles.slug, candidate), ne(articles.id, current.id)))
        .limit(1);
      return row.length > 0;
    });
  }

  const now = new Date().toISOString();
  const update: Partial<typeof articles.$inferInsert> = {
    slug: newSlug,
    updated_at: now,
  };
  if (input.title !== undefined) update.title = input.title;
  if (input.summary !== undefined) update.summary = input.summary;
  if (input.content !== undefined) {
    update.content = input.content;
    update.reading_time_min = computeReadingTime(input.content);
  }
  if (input.meta_title !== undefined) update.meta_title = input.meta_title;
  if (input.meta_description !== undefined)
    update.meta_description = input.meta_description;
  if (input.category !== undefined) update.category = input.category;
  if (input.tags !== undefined) update.tags = input.tags;
  if (input.author_name !== undefined) update.author_name = input.author_name;
  if (input.author_url !== undefined) update.author_url = input.author_url;
  if (input.hero_image_url !== undefined) update.hero_image_url = input.hero_image_url;
  if (input.key_takeaways !== undefined) update.key_takeaways = input.key_takeaways;
  if (input.faq !== undefined) update.faq = input.faq;
  if (input.aggregate_rating !== undefined) update.aggregate_rating = input.aggregate_rating;

  try {
    await db.update(articles).set(update).where(eq(articles.id, current.id));
  } catch (err) {
    return serverError(err instanceof Error ? err.message : String(err));
  }

  const updated = await db
    .select()
    .from(articles)
    .where(eq(articles.id, current.id))
    .limit(1);
  return json({ article: updated[0] });
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const slug = params.slug;
  if (!slug) return badRequest('missing slug');
  const db = createDb(locals.runtime.env.DB);

  const existing = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.slug, slug))
    .limit(1);
  if (existing.length === 0) return notFound('article not found');

  await db.delete(articles).where(eq(articles.id, existing[0]!.id));
  return json({ ok: true, slug });
};
