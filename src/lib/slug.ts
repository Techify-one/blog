/**
 * Slugs que colidem com rotas ou arquivos públicos do /blog/*.
 * Como artigos agora vivem em /blog/{slug}, qualquer um desses
 * criaria shadowing/ambiguidade com outra rota.
 *
 * Inclui nomes reservados para futuras rotas (admin, feed, rss)
 * para não precisar migrar de novo se criarmos essas páginas.
 */
const RESERVED_SLUGS = new Set([
  'artigos',
  'categoria',
  'tag',
  'busca',
  'search',
  'api',
  'sitemap.xml',
  'robots.txt',
  'admin',
  'login',
  'feed',
  'rss',
  'index',
]);

/**
 * Retorna true se o slug colide com uma rota reservada (ou com a
 * chave do IndexNow servida em /blog/{KEY}.txt).
 */
export function isReservedSlug(slug: string, indexNowKey?: string): boolean {
  if (!slug) return true;
  if (RESERVED_SLUGS.has(slug)) return true;
  if (indexNowKey && slug === indexNowKey) return true;
  return false;
}

/**
 * Generate a URL-safe slug from arbitrary text.
 * - Lowercase
 * - Strips diacritics (unicode NFD)
 * - Replaces non-alphanumeric runs with a single hyphen
 * - Trims leading/trailing hyphens
 * - Truncates to a max length (default 80) without breaking words when possible
 */
export function slugify(input: string, maxLength = 80): string {
  const normalized = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (normalized.length <= maxLength) return normalized;

  const truncated = normalized.slice(0, maxLength);
  const lastHyphen = truncated.lastIndexOf('-');
  return lastHyphen > maxLength * 0.6
    ? truncated.slice(0, lastHyphen)
    : truncated;
}

/**
 * Make sure a candidate slug is unique against an `exists` predicate.
 * Appends -2, -3, ... until a free slot is found.
 */
export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  let candidate = base;
  let counter = 2;
  // Fail-safe: bound the loop in case the predicate misbehaves.
  while (await exists(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
    if (counter > 1000) break;
  }
  return candidate;
}
