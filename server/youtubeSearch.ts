/**
 * Key-less YouTube search: fetches the public results page and reads the embedded
 * `ytInitialData` JSON with regexes. Runs server-side (Node 18+ global fetch) because
 * youtube.com does not send CORS headers. Best effort: YouTube can change its markup, so
 * ALL parsing lives in this file. Ranking and caching are in `longplaySearch.ts`.
 */
export interface VideoResult {
  videoId: string;
  title: string;
  durationSeconds: number;
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  // Skips the EU consent interstitial.
  Cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+417; SOCS=CAI',
};

// sp=EgIQAQ== restricts results to videos (no channels / playlists).
const RESULTS_URL = 'https://www.youtube.com/results?sp=EgIQAQ%253D%253D&search_query=';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESULTS = 20;

const RENDERER = /"videoRenderer":\{"videoId":"([^"]{11})".{0,6000}?"lengthText":\{.{0,300}?"simpleText":"([\d:]+)"/gs;
const TITLE = /"title":\{"runs":\[\{"text":"(.*?)"\}\]/;

export async function searchYouTube(query: string): Promise<VideoResult[]> {
  const res = await fetch(RESULTS_URL + encodeURIComponent(query), {
    headers: HEADERS,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`youtube responded ${res.status}`);
  const html = await res.text();
  const results = parseResultsPage(html);
  if (!results.length && !html.includes('videoRenderer')) {
    // No renderer at all means the markup changed or we were served a consent / captcha page.
    throw new Error('youtube results page had no video data (markup change or consent wall)');
  }
  return results;
}

/** Extracts up to `MAX_RESULTS` videos (id, title, duration) from a results page. */
export function parseResultsPage(html: string): VideoResult[] {
  const results: VideoResult[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(RENDERER)) {
    const [, videoId, length] = match;
    if (seen.has(videoId)) continue;
    seen.add(videoId);
    const title = TITLE.exec(match[0])?.[1] ?? '';
    results.push({ videoId, title: decodeJsonString(title), durationSeconds: parseDuration(length) });
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}

export function parseDuration(text: string): number {
  return text.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
}

function decodeJsonString(s: string): string {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s;
  }
}
