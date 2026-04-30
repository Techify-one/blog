import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Dynamic IndexNow key verification file.
 *
 * IndexNow requires that the public URL `https://{host}/{KEY}.txt` returns the
 * literal key as plain text. Rather than committing the key as a static file,
 * we serve it from the Worker so the only secret is the env binding.
 *
 * Returns 404 for any other `*.txt` path so we don't leak that this route exists.
 */
export const GET: APIRoute = ({ params, locals }) => {
  const key = params.key;
  const expected = locals.runtime.env.INDEXNOW_KEY;

  if (!key || !expected || key !== expected) {
    return new Response('Not Found', { status: 404 });
  }

  return new Response(expected, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
