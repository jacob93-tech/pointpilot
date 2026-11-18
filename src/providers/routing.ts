import type { TravelMode } from '../lib/types';
import { cacheGet, cachePut } from '../lib/db';
import { fetchJSON, ProviderError, rateLimit } from './http';

/**
 * Routing via free public OSRM servers:
 *  - FOSSGIS (routing.openstreetmap.de) — car, bike, foot profiles
 *  - project-osrm.org demo — car only, used as a fallback for driving
 * Both are donation-run with fair-use policies, so calls are rate-limited and cached.
 * Public transit routing is NOT available for free here — the UI links to Google Maps transit directions.
 */
interface LatLon { lat: number; lon: number }

const BASES: Record<TravelMode, string[]> = {
  foot: ['https://routing.openstreetmap.de/routed-foot'],
  bike: ['https://routing.openstreetmap.de/routed-bike'],
  driving: ['https://routing.openstreetmap.de/routed-car', 'https://router.project-osrm.org'],
};

const coordStr = (pts: LatLon[]) => pts.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
const CACHE_MS = 7 * 24 * 3600 * 1000;

export async function durationMatrix(points: LatLon[], mode: TravelMode): Promise<number[][]> {
  if (points.length < 2) return points.map(() => [0]);
  if (points.length > 25) throw new ProviderError('Too many stops for the free routing service (max 25).', 'parse');
  const key = `table:${mode}:${coordStr(points)}`;
  const c = await cacheGet<number[][]>(key, CACHE_MS);
  if (c) return c.value;
  let lastErr: unknown;
  for (const base of BASES[mode]) {
    try {
      await rateLimit('osrm', 1000);
      const res = await fetchJSON<{ code: string; durations: (number | null)[][] }>(`${base}/table/v1/driving/${coordStr(points)}?annotations=duration`, { timeoutMs: 15000 });
      if (res.code !== 'Ok' || !res.durations) throw new ProviderError('Routing service could not build a matrix.', 'http');
      if (res.durations.some((row) => row.some((v) => v == null))) throw new ProviderError('Some stops are unreachable by this mode.', 'http');
      const m = res.durations as number[][];
      await cachePut(key, m);
      return m;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export interface RouteResult {
  geometry: [number, number][]; // [lat, lon]
  legs: { durationSec: number; distanceM: number }[];
  durationSec: number;
  distanceM: number;
  provider: string;
}

export async function route(points: LatLon[], mode: TravelMode): Promise<RouteResult> {
  if (points.length < 2) throw new ProviderError('Need at least two stops.', 'parse');
  const key = `route:${mode}:${coordStr(points)}`;
  const c = await cacheGet<RouteResult>(key, CACHE_MS);
  if (c) return c.value;
  let lastErr: unknown;
  for (const base of BASES[mode]) {
    try {
      await rateLimit('osrm', 1000);
      const res = await fetchJSON<{
        code: string;
        routes: { geometry: { coordinates: [number, number][] }; legs: { duration: number; distance: number }[]; duration: number; distance: number }[];
      }>(`${base}/route/v1/driving/${coordStr(points)}?overview=full&geometries=geojson&steps=false`, { timeoutMs: 15000 });
      if (res.code !== 'Ok' || !res.routes?.length) throw new ProviderError('No route found between these stops.', 'http');
      const r = res.routes[0];
      const out: RouteResult = {
        geometry: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
        legs: r.legs.map((l) => ({ durationSec: l.duration, distanceM: l.distance })),
        durationSec: r.duration,
        distanceM: r.distance,
        provider: base.includes('openstreetmap.de') ? 'FOSSGIS OSRM' : 'OSRM demo server',
      };
      await cachePut(key, out);
      return out;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
