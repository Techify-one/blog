/**
 * IndexNow client — notifies Bing/Copilot/Yandex of a new or updated URL.
 * https://www.indexnow.org/documentation
 */
export interface IndexNowResult {
  ok: boolean;
  status: number;
  body?: string;
}

export async function pingIndexNow(
  urls: string[],
  host: string,
  key: string,
  keyLocation?: string,
): Promise<IndexNowResult> {
  if (!key || urls.length === 0) {
    return { ok: false, status: 0, body: 'missing key or urls' };
  }

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        host,
        key,
        keyLocation: keyLocation ?? `https://${host}/${key}.txt`,
        urlList: urls,
      }),
    });
    return {
      ok: res.ok,
      status: res.status,
      body: res.ok ? undefined : await res.text(),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: err instanceof Error ? err.message : String(err),
    };
  }
}
