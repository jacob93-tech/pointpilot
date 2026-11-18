import { cacheGet, cachePut } from '../lib/db';
import { fetchJSON } from './http';

/**
 * Destination photo + short description from the Wikipedia REST summary API (free, CORS).
 * Images are Wikimedia Commons files with their own licenses; the UI links back to the
 * article for attribution.
 */
export interface WikiSummary {
  title: string;
  extract: string;
  imageUrl?: string;
  pageUrl: string;
}

export async function wikiSummary(title: string): Promise<WikiSummary | null> {
  const key = `wiki:${title}`;
  const c = await cacheGet<WikiSummary | null>(key, 30 * 24 * 3600 * 1000);
  if (c) return c.value;
  const res = await fetchJSON<{
    title: string;
    extract: string;
    thumbnail?: { source: string };
    originalimage?: { source: string };
    content_urls?: { desktop?: { page?: string } };
  }>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { timeoutMs: 10000 });
  const out: WikiSummary = {
    title: res.title,
    extract: res.extract,
    imageUrl: res.thumbnail?.source?.replace(/\/(\d+)px-/, '/960px-') ?? res.originalimage?.source,
    pageUrl: res.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  };
  await cachePut(key, out);
  return out;
}
