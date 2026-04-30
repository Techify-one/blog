import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = ({ locals }) => {
  const env = locals.runtime.env;
  const siteUrl = env.SITE_URL.replace(/\/$/, '');

  const body = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
