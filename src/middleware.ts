import { defineMiddleware } from 'astro:middleware';
import { isAuthorized, unauthorized } from './lib/auth';
import { url } from './lib/paths';

const API_PREFIX = url('/api/');
const SEARCH_PREFIX = url('/api/search');
const LEGACY_ARTICLE_PREFIX = url('/artigos/');

export const onRequest = defineMiddleware(async (context, next) => {
  const { host, pathname, search } = context.url;
  const env = context.locals.runtime?.env;

  // Canonicalize host: if SITE_URL points to apex but request came in on www
  // (or any other variant of the same registrable domain), 301 to the canonical host.
  if (env?.SITE_URL) {
    try {
      const canonicalHost = new URL(env.SITE_URL).host;
      const apex = canonicalHost.replace(/^www\./, '');
      if (host !== canonicalHost && (host === `www.${apex}` || host === apex)) {
        const target = new URL(context.request.url);
        target.host = canonicalHost;
        return Response.redirect(target.toString(), 301);
      }
    } catch {
      // SITE_URL is malformed; skip redirect rather than crash.
    }
  }

  // Legacy /blog/artigos/{slug} → /blog/{slug} (URL structure migration).
  // Keeps old external links and citations working; preserves query string.
  if (pathname.startsWith(LEGACY_ARTICLE_PREFIX)) {
    const slug = pathname.slice(LEGACY_ARTICLE_PREFIX.length);
    if (slug) {
      const target = new URL(context.request.url);
      target.pathname = `${url('')}/${slug}`.replace(/\/{2,}/g, '/');
      target.search = search;
      return Response.redirect(target.toString(), 301);
    }
  }

  if (pathname.startsWith(API_PREFIX) && !pathname.startsWith(SEARCH_PREFIX)) {
    if (!isAuthorized(context.request, env?.API_KEY)) {
      return unauthorized();
    }
  }

  return next();
});
