import type { Destination } from '../lib/types';
import type { WeatherStats } from '../engine/ranking';
import { cacheGet, cacheGetStale, cachePut } from '../lib/db';
import { fetchJSON, ProviderError, rateLimit } from './http';

/**
 * Observed historical weather from Open-Meteo's archive API (free, no key, CORS-enabled,
 * non-commercial use). For a travel month we average the last 3 completed years.
 * This is HISTORY, not a forecast — labeled that way in the UI.
 */
interface ArchiveRes {
  daily: { time: string[]; temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[]; precipitation_sum: (number | null)[] };
}

export function lastCompletedYears(month: number, today = new Date(), n = 3): number[] {
  const y = today.getFullYear();
  const cur = today.getMonth() + 1;
  // the month must be fully in the past (archive lags by a few days)
  const newest = cur > month ? y : y - 1;
  return Array.from({ length: n }, (_, i) => newest - (n - 1) + i);
}

export function summarizeArchive(res: ArchiveRes, month: number, years: number[]): WeatherStats | null {
  const highs: number[] = [];
  const lows: number[] = [];
  let rainy = 0;
  let days = 0;
  res.daily.time.forEach((t, i) => {
    const m = Number(t.slice(5, 7));
    const yr = Number(t.slice(0, 4));
    if (m !== month || !years.includes(yr)) return;
    const hi = res.daily.temperature_2m_max[i];
    const lo = res.daily.temperature_2m_min[i];
    const pr = res.daily.precipitation_sum[i];
    if (hi == null || lo == null) return;
    highs.push(hi);
    lows.push(lo);
    days++;
    if ((pr ?? 0) >= 2) rainy++; // ≥2 mm: reanalysis grids over-count light drizzle
  });
  if (!days) return null;
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  return { month, avgHighC: avg(highs), avgLowC: avg(lows), rainyDayPct: (rainy / days) * 100, years, fetchedAt: new Date().toISOString() };
}

export async function monthWeather(dest: Pick<Destination, 'id' | 'lat' | 'lon'>, month: number): Promise<WeatherStats | null> {
  const key = `wx2:${dest.id}:${month}`;
  const c = await cacheGet<WeatherStats>(key, 90 * 24 * 3600 * 1000);
  if (c) return c.value;
  const years = lastCompletedYears(month);
  // One small request per year: Open-Meteo weights requests by days of data, so three
  // one-month windows cost far less of the free per-minute allowance than one 3-year span.
  const merged: ArchiveRes = { daily: { time: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_sum: [] } };
  try {
    for (const y of years) {
      const mm = String(month).padStart(2, '0');
      const endDay = new Date(Date.UTC(y, month, 0)).getUTCDate();
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${dest.lat}&longitude=${dest.lon}&start_date=${y}-${mm}-01&end_date=${y}-${mm}-${endDay}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
      await rateLimit('open-meteo', 700); // stay well under the free per-minute allowance
      const res = await fetchJSON<ArchiveRes>(url, { timeoutMs: 15000 });
      merged.daily.time.push(...res.daily.time);
      merged.daily.temperature_2m_max.push(...res.daily.temperature_2m_max);
      merged.daily.temperature_2m_min.push(...res.daily.temperature_2m_min);
      merged.daily.precipitation_sum.push(...res.daily.precipitation_sum);
    }
    const s = summarizeArchive(merged, month, years);
    if (s) await cachePut(key, s);
    return s;
  } catch (e) {
    const stale = await cacheGetStale<WeatherStats>(key);
    if (stale) return stale.value;
    throw e;
  }
}

/**
 * Fetch weather for many destinations with limited concurrency. Failures are skipped
 * (general climate guidance is used). Stops early if the free service rate-limits us.
 */
export async function weatherForAll(
  dests: Destination[],
  month: number,
  onEach?: (id: string, w: WeatherStats | null) => void,
  concurrency = 2,
): Promise<{ ok: number; failed: number; rateLimited: boolean }> {
  let i = 0;
  let ok = 0;
  let failed = 0;
  let rateLimited = false;
  const worker = async () => {
    while (i < dests.length && !rateLimited) {
      const d = dests[i++];
      try {
        const w = await monthWeather(d, month);
        if (w) ok++;
        onEach?.(d.id, w);
      } catch (e) {
        failed++;
        if (e instanceof ProviderError && e.kind === 'rate-limited') rateLimited = true;
        onEach?.(d.id, null);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { ok, failed: failed + (rateLimited ? dests.length - i : 0), rateLimited };
}
