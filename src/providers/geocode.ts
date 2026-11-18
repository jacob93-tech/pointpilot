import type { PlaceCategory } from '../lib/types';
import { cacheGet, cachePut } from '../lib/db';
import { fetchJSON, ProviderError, rateLimit } from './http';

/**
 * Geocoding / place search via OpenStreetMap Nominatim (free, no key).
 * Usage policy honored: ≤1 request/second, no autocomplete (search on submit only),
 * results cached in IndexedDB for 30 days, attribution shown in the UI.
 * Photon (komoot) is used as a fallback when Nominatim fails.
 */
export interface GeoResult {
  name: string;
  address: string;
  lat: number;
  lon: number;
  osmRef: string;
  category: PlaceCategory;
  osmType: string;
  openingHours?: string;
  website?: string;
  provider: 'nominatim' | 'photon';
}

const CACHE_MS = 30 * 24 * 3600 * 1000;

export interface SearchOpts {
  near?: { lat: number; lon: number };
  /** half-width of the bounding box in degrees */
  radiusDeg?: number;
  bounded?: boolean;
  limit?: number;
  email?: string;
}

export async function searchPlaces(query: string, opts: SearchOpts = {}): Promise<GeoResult[]> {
  const q = query.trim();
  if (q.length < 2) throw new ProviderError('Type at least 2 characters.', 'parse');
  if (q.length > 200) throw new ProviderError('Search text is too long.', 'parse');
  const r = opts.radiusDeg ?? 0.25;
  const key = `geo:${q.toLowerCase()}:${opts.near ? `${opts.near.lat.toFixed(2)},${opts.near.lon.toFixed(2)}:${r}:${opts.bounded ? 1 : 0}` : 'global'}`;
  const cached = await cacheGet<GeoResult[]>(key, CACHE_MS);
  if (cached) return cached.value;

  let results: GeoResult[];
  try {
    results = await nominatim(q, opts, r);
  } catch (e) {
    try {
      results = await photon(q, opts);
    } catch {
      throw e;
    }
  }
  await cachePut(key, results);
  return results;
}

interface NomRow {
  place_id: number;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  category?: string;
  class?: string;
  type: string;
  extratags?: Record<string, string>;
}

async function nominatim(q: string, opts: SearchOpts, r: number): Promise<GeoResult[]> {
  const p = new URLSearchParams({ q, format: 'jsonv2', addressdetails: '0', extratags: '1', limit: String(opts.limit ?? 10) });
  if (opts.near) {
    const { lat, lon } = opts.near;
    p.set('viewbox', `${lon - r},${lat + r},${lon + r},${lat - r}`);
    if (opts.bounded) p.set('bounded', '1');
  }
  if (opts.email) p.set('email', opts.email);
  await rateLimit('nominatim', 1100);
  const rows = await fetchJSON<NomRow[]>(`https://nominatim.openstreetmap.org/search?${p}`);
  return rows.map((row) => {
    const cls = row.category ?? row.class ?? '';
    return {
      name: row.name || row.display_name.split(',')[0],
      address: row.display_name,
      lat: Number(row.lat),
      lon: Number(row.lon),
      osmRef: `${row.osm_type}/${row.osm_id}`,
      category: categorize(cls, row.type),
      osmType: `${cls}:${row.type}`,
      openingHours: row.extratags?.opening_hours,
      website: row.extratags?.website,
      provider: 'nominatim' as const,
    };
  });
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { osm_type?: string; osm_id?: number; osm_key?: string; osm_value?: string; name?: string; street?: string; housenumber?: string; city?: string; country?: string };
}

async function photon(q: string, opts: SearchOpts): Promise<GeoResult[]> {
  const p = new URLSearchParams({ q, limit: String(opts.limit ?? 10), lang: 'en' });
  if (opts.near) { p.set('lat', String(opts.near.lat)); p.set('lon', String(opts.near.lon)); }
  await rateLimit('photon', 500);
  const res = await fetchJSON<{ features: PhotonFeature[] }>(`https://photon.komoot.io/api/?${p}`);
  return res.features.map((f) => {
    const pr = f.properties;
    const addr = [pr.housenumber && pr.street ? `${pr.housenumber} ${pr.street}` : pr.street, pr.city, pr.country].filter(Boolean).join(', ');
    return {
      name: pr.name ?? addr ?? q,
      address: addr,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      osmRef: `${pr.osm_type === 'N' ? 'node' : pr.osm_type === 'W' ? 'way' : 'relation'}/${pr.osm_id}`,
      category: categorize(pr.osm_key ?? '', pr.osm_value ?? ''),
      osmType: `${pr.osm_key}:${pr.osm_value}`,
      provider: 'photon' as const,
    };
  });
}

export function categorize(cls: string, type: string): PlaceCategory {
  if (cls === 'amenity') {
    if (['restaurant', 'fast_food', 'food_court', 'ice_cream'].includes(type)) return 'restaurant';
    if (['cafe', 'bakery'].includes(type)) return 'cafe';
    if (['bar', 'pub', 'nightclub', 'biergarten'].includes(type)) return 'nightlife';
    if (['bus_station', 'ferry_terminal', 'car_rental', 'taxi'].includes(type)) return 'transport';
    if (['theatre', 'cinema', 'arts_centre'].includes(type)) return 'attraction';
  }
  if (cls === 'shop') return type === 'bakery' ? 'cafe' : 'shopping';
  if (cls === 'tourism') {
    if (['hotel', 'hostel', 'guest_house', 'motel', 'apartment'].includes(type)) return 'hotel';
    return 'attraction';
  }
  if (cls === 'historic') return 'attraction';
  if (cls === 'leisure') return ['park', 'garden', 'nature_reserve'].includes(type) ? 'nature' : 'attraction';
  if (cls === 'natural' || (cls === 'boundary' && ['national_park', 'protected_area'].includes(type))) return 'nature';
  if (cls === 'railway' || cls === 'aeroway' || cls === 'public_transport') return 'transport';
  return 'custom';
}

/** Parse simple OSM opening_hours like "09:00-17:00" or "Mo-Su 10:00-22:00". Complex rules return null. */
export function simpleHours(oh: string | undefined): { open: string; close: string } | null {
  if (!oh) return null;
  const m = /^(?:Mo-Su\s+)?(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(oh.trim());
  return m ? { open: m[1], close: m[2] } : null;
}
