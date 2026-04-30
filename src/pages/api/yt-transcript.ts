import type { APIRoute } from 'astro';
import { YoutubeTranscript } from 'youtube-transcript';
import { Innertube } from 'youtubei.js/cf-worker';

export const prerender = false;

type Attempt = {
  strategy: string;
  ok: boolean;
  error?: string;
  count?: number;
  lang?: string;
};

/**
 * GET /api/yt-transcript?v=VIDEO_ID&lang=en,pt-BR
 *
 * Extract a YouTube transcript from inside the Worker. Tries multiple
 * strategies in sequence and reports which one succeeded (or why all failed).
 *
 *   1. youtube-transcript  (npm)  — lightweight scraper of the watch page
 *   2. youtubei.js         (npm)  — reverse-engineered InnerTube API client
 *
 * Under /api/* so the auth middleware enforces the Bearer token.
 */
export const GET: APIRoute = async ({ url }) => {
  const videoId = url.searchParams.get('v')?.trim() ?? '';
  const langs = (url.searchParams.get('lang') ?? 'en,pt-BR,pt,es')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!videoId) {
    return Response.json({ ok: false, error: 'missing ?v=' }, { status: 400 });
  }

  const attempts: Attempt[] = [];

  // Strategy 1: youtube-transcript ------------------------------------------
  for (const lang of langs) {
    try {
      const items = await YoutubeTranscript.fetchTranscript(videoId, { lang });
      attempts.push({ strategy: 'youtube-transcript', lang, ok: true, count: items.length });
      return Response.json({
        ok: true,
        strategy: 'youtube-transcript',
        videoId,
        lang,
        count: items.length,
        text: items.map((i) => i.text).join(' '),
        snippets: items.slice(0, 10),
        attempts,
      });
    } catch (err) {
      attempts.push({
        strategy: 'youtube-transcript',
        lang,
        ok: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
    }
  }

  // Strategy 2: youtubei.js --------------------------------------------------
  try {
    const yt = await Innertube.create({
      // Let the lib manage its own fetch; no external cache needed here.
      retrieve_player: false,
    });
    const info = await yt.getInfo(videoId);
    const transcriptInfo = await info.getTranscript();
    const segments =
      transcriptInfo?.transcript?.content?.body?.initial_segments ?? [];
    if (segments.length === 0) throw new Error('no segments');

    const snippets = segments.map((seg: any) => ({
      text: seg.snippet?.text ?? '',
      start: Number(seg.start_ms ?? 0) / 1000,
      duration: (Number(seg.end_ms ?? 0) - Number(seg.start_ms ?? 0)) / 1000,
    }));

    attempts.push({ strategy: 'youtubei.js', ok: true, count: snippets.length });
    return Response.json({
      ok: true,
      strategy: 'youtubei.js',
      videoId,
      count: snippets.length,
      text: snippets.map((s: any) => s.text).join(' '),
      snippets: snippets.slice(0, 10),
      attempts,
    });
  } catch (err) {
    attempts.push({
      strategy: 'youtubei.js',
      ok: false,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
  }

  return Response.json({ ok: false, videoId, attempts }, { status: 502 });
};
