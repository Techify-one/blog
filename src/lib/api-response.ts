/**
 * Small helpers for consistent JSON API responses.
 */
export function json<T>(data: T, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...init.headers,
    },
  });
}

export function badRequest(message: string, details?: unknown): Response {
  return json({ error: 'bad_request', message, details }, { status: 400 });
}

export function notFound(message = 'Not found'): Response {
  return json({ error: 'not_found', message }, { status: 404 });
}

export function serverError(message: string): Response {
  return json({ error: 'server_error', message }, { status: 500 });
}

export function methodNotAllowed(allowed: string[]): Response {
  return json(
    { error: 'method_not_allowed', allowed },
    { status: 405, headers: { Allow: allowed.join(', ') } },
  );
}
