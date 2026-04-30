/**
 * Validation + normalization for article payloads received by the API.
 * Kept manual (no zod) to keep the bundle small on Workers.
 */

import type { FaqItem, AggregateRating } from '~/db/schema';

export interface ArticleCreateInput {
  title: string;
  summary: string;
  content: string;
  meta_title?: string;
  meta_description?: string;
  category?: string;
  tags?: string[];
  author_name?: string;
  author_url?: string;
  slug?: string;
  hero_image_url?: string;
  key_takeaways?: string[];
  faq?: FaqItem[];
  aggregate_rating?: AggregateRating;
}

export interface ArticleUpdateInput {
  title?: string;
  summary?: string;
  content?: string;
  meta_title?: string | null;
  meta_description?: string | null;
  category?: string | null;
  tags?: string[];
  author_name?: string;
  author_url?: string | null;
  slug?: string;
  hero_image_url?: string | null;
  key_takeaways?: string[] | null;
  faq?: FaqItem[] | null;
  aggregate_rating?: AggregateRating | null;
}

interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors?: string[];
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateFaq(v: unknown, errors: string[]): FaqItem[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) {
    errors.push('faq must be an array of {q, a}');
    return undefined;
  }
  const out: FaqItem[] = [];
  for (let i = 0; i < v.length; i++) {
    const item = v[i];
    if (
      !item ||
      typeof item !== 'object' ||
      !isNonEmptyString((item as Record<string, unknown>).q) ||
      !isNonEmptyString((item as Record<string, unknown>).a)
    ) {
      errors.push(`faq[${i}] must have non-empty q and a strings`);
      return undefined;
    }
    const o = item as Record<string, unknown>;
    out.push({ q: (o.q as string).trim(), a: (o.a as string).trim() });
  }
  return out;
}

function validateTakeaways(v: unknown, errors: string[]): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || !v.every(isString)) {
    errors.push('key_takeaways must be an array of strings');
    return undefined;
  }
  return (v as string[]).map((s) => s.trim()).filter(Boolean);
}

function validateAggregateRating(
  v: unknown,
  errors: string[],
): AggregateRating | undefined {
  if (v === undefined) return undefined;
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    errors.push('aggregate_rating must be an object { value, count, best?, worst? }');
    return undefined;
  }
  const o = v as Record<string, unknown>;
  const value = typeof o.value === 'number' ? o.value : NaN;
  const count = typeof o.count === 'number' ? o.count : NaN;
  const best = typeof o.best === 'number' ? o.best : undefined;
  const worst = typeof o.worst === 'number' ? o.worst : undefined;
  if (!Number.isFinite(value) || value < 0) {
    errors.push('aggregate_rating.value must be a non-negative number');
    return undefined;
  }
  if (!Number.isFinite(count) || !Number.isInteger(count) || count < 1) {
    errors.push('aggregate_rating.count must be a positive integer');
    return undefined;
  }
  const maxScale = best ?? 5;
  if (value > maxScale) {
    errors.push(`aggregate_rating.value cannot exceed best (${maxScale})`);
    return undefined;
  }
  const result: AggregateRating = { value, count };
  if (best !== undefined) result.best = best;
  if (worst !== undefined) result.worst = worst;
  return result;
}

export function validateCreate(body: unknown): ValidationResult<ArticleCreateInput> {
  const errors: string[] = [];
  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['body must be a JSON object'] };
  }
  const b = body as Record<string, unknown>;

  if (!isNonEmptyString(b.title)) errors.push('title is required');
  if (!isNonEmptyString(b.summary)) errors.push('summary is required');
  if (!isNonEmptyString(b.content)) errors.push('content is required');

  if (b.tags !== undefined && !Array.isArray(b.tags)) {
    errors.push('tags must be an array of strings');
  }
  if (Array.isArray(b.tags) && !b.tags.every(isString)) {
    errors.push('tags must be an array of strings');
  }

  const takeaways = validateTakeaways(b.key_takeaways, errors);
  const faq = validateFaq(b.faq, errors);
  const aggregateRating = validateAggregateRating(b.aggregate_rating, errors);

  if (errors.length > 0) return { ok: false, errors };

  const value: ArticleCreateInput = {
    title: (b.title as string).trim(),
    summary: (b.summary as string).trim(),
    content: b.content as string,
    meta_title: isNonEmptyString(b.meta_title) ? b.meta_title.trim() : undefined,
    meta_description: isNonEmptyString(b.meta_description)
      ? b.meta_description.trim()
      : undefined,
    category: isNonEmptyString(b.category) ? b.category.trim() : undefined,
    tags: Array.isArray(b.tags) ? (b.tags as string[]) : undefined,
    author_name: isNonEmptyString(b.author_name) ? b.author_name.trim() : undefined,
    author_url: isNonEmptyString(b.author_url) ? b.author_url.trim() : undefined,
    slug: isNonEmptyString(b.slug) ? b.slug.trim() : undefined,
    hero_image_url: isNonEmptyString(b.hero_image_url) ? b.hero_image_url.trim() : undefined,
    key_takeaways: takeaways,
    faq,
    aggregate_rating: aggregateRating,
  };
  return { ok: true, value };
}

export function validateUpdate(body: unknown): ValidationResult<ArticleUpdateInput> {
  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['body must be a JSON object'] };
  }
  const b = body as Record<string, unknown>;
  const errors: string[] = [];

  if (b.tags !== undefined) {
    if (!Array.isArray(b.tags) || !b.tags.every(isString)) {
      errors.push('tags must be an array of strings');
    }
  }

  // Required-when-present checks
  for (const key of ['title', 'summary', 'content', 'author_name'] as const) {
    if (b[key] !== undefined && !isNonEmptyString(b[key])) {
      errors.push(`${key} cannot be empty`);
    }
  }

  const takeaways = b.key_takeaways === null ? null : validateTakeaways(b.key_takeaways, errors);
  const faq = b.faq === null ? null : validateFaq(b.faq, errors);
  const aggregateRating =
    b.aggregate_rating === null ? null : validateAggregateRating(b.aggregate_rating, errors);

  if (errors.length > 0) return { ok: false, errors };

  const value: ArticleUpdateInput = {};
  if (b.title !== undefined) value.title = (b.title as string).trim();
  if (b.summary !== undefined) value.summary = (b.summary as string).trim();
  if (b.content !== undefined) value.content = b.content as string;
  if (b.meta_title !== undefined)
    value.meta_title = b.meta_title === null ? null : (b.meta_title as string).trim();
  if (b.meta_description !== undefined)
    value.meta_description =
      b.meta_description === null ? null : (b.meta_description as string).trim();
  if (b.category !== undefined)
    value.category = b.category === null ? null : (b.category as string).trim();
  if (b.tags !== undefined) value.tags = b.tags as string[];
  if (b.author_name !== undefined) value.author_name = (b.author_name as string).trim();
  if (b.author_url !== undefined)
    value.author_url = b.author_url === null ? null : (b.author_url as string).trim();
  if (b.slug !== undefined) value.slug = (b.slug as string).trim();
  if (b.hero_image_url !== undefined)
    value.hero_image_url =
      b.hero_image_url === null ? null : (b.hero_image_url as string).trim();
  if (b.key_takeaways !== undefined) value.key_takeaways = takeaways ?? null;
  if (b.faq !== undefined) value.faq = faq ?? null;
  if (b.aggregate_rating !== undefined) value.aggregate_rating = aggregateRating ?? null;

  return { ok: true, value };
}
