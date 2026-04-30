const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function url(path = ''): string {
  if (!path || path === '/') return BASE || '/';
  return `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
}
