/**
 * Notify Google that the sitemap has been updated.
 *
 * Note: Google deprecated `/ping?sitemap=` in mid-2023 — the endpoint still
 * accepts requests but is a no-op for indexing prioritization. We keep the
 * call as a low-cost signal and rely on Search Console + sitemap freshness
 * for the actual discovery path.
 */
export async function pingGoogleSitemap(siteUrl: string): Promise<{ ok: boolean; status: number }> {
  const sitemapUrl = `${siteUrl.replace(/\/$/, '')}/sitemap.xml`;
  const target = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
  try {
    const res = await fetch(target, { method: 'GET' });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
