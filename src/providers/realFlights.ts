import { cacheGet, cachePut, db } from '../lib/db';
import type { Cabin } from '../lib/types';
import { parseFlights, type RealFlightResult } from '../engine/realFlights';
import { ProviderError } from './http';

/**
 * Real Google Flights results through the user's OWN Cloudflare Worker relay
 * (worker/serpapi-relay.js), which holds their free SerpApi key.
 *
 * Budget guard: SerpApi's free plan has a monthly search allowance. Every new search
 * is counted locally per calendar month and blocked at the user's cap; identical
 * searches are served from a 24 h cache (labeled "Cached" with the fetch time).
 */

export interface RelayConfig {
  url: string;
  token: string;
  monthlyCap: number;
}

export const DEFAULT_CAP = 200;
const CFG_KEY = 'realFlightsConfig';
const USAGE_KEY = 'realFlightsUsage';
const DAY = 24 * 3600 * 1000;

export async function getRelayConfig(): Promise<RelayConfig | null> {
  const v = (await db.meta.get(CFG_KEY))?.value as RelayConfig | undefined;
  return v && v.url && v.token ? { ...v, monthlyCap: v.monthlyCap || DEFAULT_CAP } : null;
}

export async function saveRelayConfig(c: RelayConfig | null): Promise<void> {
  if (!c) await db.meta.delete(CFG_KEY);
  else await db.meta.put({ key: CFG_KEY, value: { url: normalizeRelayUrl(c.url), token: c.token.trim(), monthlyCap: c.monthlyCap || DEFAULT_CAP } });
}

export function normalizeRelayUrl(u: string): string {
  const s = u.trim().replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+(\.[a-z]{2,})(\/[\w./-]*)?$/i.test(s)) throw new Error('Relay URL must be an https:// address, e.g. https://pointpilot-flights.yourname.workers.dev');
  return s;
}

const monthKey = () => new Date().toISOString().slice(0, 7);

export async function getUsage(): Promise<{ month: string; count: number }> {
  const v = (await db.meta.get(USAGE_KEY))?.value as { month: string; count: number } | undefined;
  return v && v.month === monthKey() ? v : { month: monthKey(), count: 0 };
}

async function bumpUsage(): Promise<void> {
  const u = await getUsage();
  await db.meta.put({ key: USAGE_KEY, value: { month: u.month, count: u.count + 1 } });
}

const CLS: Record<Cabin, number> = { economy: 1, premium: 2, business: 3, first: 4 };

export interface FlightSearch {
  from: string[];
  to: string;
  depart: string;
  ret?: string;
  adults: number;
  cabin: Cabin;
}

export function searchKey(q: FlightSearch): string {
  return `rf1:${[...q.from].sort().join(',')}:${q.to}:${q.depart}:${q.ret ?? ''}:${q.adults}:${q.cabin}`;
}

export async function cachedFlights(q: FlightSearch): Promise<{ result: RealFlightResult; fetchedAt: string } | null> {
  const hit = await cacheGet<RealFlightResult>(searchKey(q), DAY);
  return hit ? { result: hit.value, fetchedAt: hit.fetchedAt } : null;
}

async function relayFetch(cfg: RelayConfig, path: string): Promise<unknown> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ProviderError('You appear to be offline.', 'offline');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  let res: Response;
  try {
    res = await fetch(cfg.url + path, { headers: { 'X-PointPilot-Token': cfg.token }, signal: ctrl.signal });
  } catch (e) {
    throw (e as Error).name === 'AbortError'
      ? new ProviderError('Flight search took too long. Try again.', 'timeout')
      : new ProviderError('Could not reach your flight relay. Check the relay URL in Settings.', 'network');
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (body.code === 'no-results') return body;
  if (!res.ok || body.error) {
    const msg =
      body.code === 'quota'
        ? 'Your free SerpApi searches for this month are used up. They reset next month — nothing is charged.'
        : body.code === 'bad-token'
          ? 'Wrong app token — it must match the APP_TOKEN secret on your Cloudflare Worker.'
          : body.code === 'bad-key'
            ? 'SerpApi rejected the API key stored on your Worker.'
            : body.error || `Relay error (HTTP ${res.status}).`;
    throw new ProviderError(msg, res.status === 429 || body.code === 'quota' ? 'rate-limited' : 'http', res.status);
  }
  return body;
}

/** Runs a real search (uses 1 SerpApi search) unless an identical one is cached from the last 24 h. */
export async function searchRealFlights(cfg: RelayConfig, q: FlightSearch, opts: { force?: boolean } = {}): Promise<{ result: RealFlightResult; fetchedAt: string; fromCache: boolean }> {
  if (!opts.force) {
    const hit = await cachedFlights(q);
    if (hit) return { ...hit, fromCache: true };
  }
  const usage = await getUsage();
  if (usage.count >= cfg.monthlyCap) {
    throw new ProviderError(`You've used ${usage.count} of your ${cfg.monthlyCap} real-flight searches this month (your cap in Settings). They reset on the 1st.`, 'rate-limited');
  }
  const p = new URLSearchParams({ dep: q.from.join(','), arr: q.to, out: q.depart, adults: String(q.adults), cls: String(CLS[q.cabin]) });
  if (q.ret) p.set('ret', q.ret);
  const body = await relayFetch(cfg, `/flights?${p}`);
  await bumpUsage();
  const result = parseFlights(body);
  await cachePut(searchKey(q), result);
  return { result, fetchedAt: new Date().toISOString(), fromCache: false };
}

export interface RelayQuota {
  plan: string | null;
  searchesPerMonth: number | null;
  searchesLeft: number | null;
  usedThisMonth: number | null;
}

/** Free check (SerpApi's account endpoint doesn't use a search). */
export async function relayQuota(cfg: RelayConfig): Promise<RelayQuota> {
  return (await relayFetch(cfg, '/quota')) as RelayQuota;
}
