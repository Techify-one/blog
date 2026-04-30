/**
 * Constant-time string comparison to avoid timing attacks on the API key check.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Validate a Bearer token from the Authorization header against the configured API_KEY.
 */
export function isAuthorized(request: Request, apiKey: string | undefined): boolean {
  if (!apiKey) return false;
  const header = request.headers.get('Authorization');
  if (!header) return false;
  const expected = `Bearer ${apiKey}`;
  return timingSafeEqual(header, expected);
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer realm="blog-api"',
    },
  });
}
