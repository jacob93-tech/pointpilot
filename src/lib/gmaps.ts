import { isValidLatLon } from '../engine/geo';

export interface ParsedMapsLink {
  ok: boolean;
  lat?: number;
  lon?: number;
  name?: string;
  /** maps.app.goo.gl / goo.gl short links can't be expanded client-side for free (CORS) */
  shortLink?: boolean;
  reason?: string;
}

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';

/** Extract coordinates and/or a place name from a pasted Google Maps URL. No network calls. */
export function parseGoogleMapsLink(input: string): ParsedMapsLink {
  const raw = input.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'That doesn’t look like a URL.' };
  }
  if (!/^https?:$/.test(url.protocol)) return { ok: false, reason: 'Only http(s) links are supported.' };
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'maps.app.goo.gl' || (host === 'goo.gl' && url.pathname.startsWith('/maps'))) {
    return {
      ok: false,
      shortLink: true,
      reason: 'Short share links (maps.app.goo.gl) can’t be expanded for free from the browser. Open it, then copy the full URL from the address bar — or add the place manually.',
    };
  }
  if (!/(^|\.)google\.[a-z.]+$/.test(host) && host !== 'maps.google.com') {
    return { ok: false, reason: 'Not a Google Maps link.' };
  }

  const decoded = decodeURIComponent(raw);
  let lat: number | undefined;
  let lon: number | undefined;

  // Most precise: place pin coordinates in the data blob
  const pin = new RegExp(`!3d${NUM}!4d${NUM}`).exec(decoded);
  if (pin) [lat, lon] = [Number(pin[1]), Number(pin[2])];

  if (lat === undefined) {
    for (const key of ['q', 'query', 'll', 'destination', 'center']) {
      const v = url.searchParams.get(key);
      const m = v && new RegExp(`^\\s*${NUM}\\s*,\\s*${NUM}\\s*$`).exec(v);
      if (m) { [lat, lon] = [Number(m[1]), Number(m[2])]; break; }
    }
  }
  if (lat === undefined) {
    const at = new RegExp(`@${NUM},${NUM}`).exec(decoded);
    if (at) [lat, lon] = [Number(at[1]), Number(at[2])];
  }

  let name: string | undefined;
  const place = /\/place\/([^/@?]+)/.exec(url.pathname);
  if (place) name = decodeURIComponent(place[1].replace(/\+/g, ' ')).trim();
  if (!name) {
    const q = url.searchParams.get('q') ?? url.searchParams.get('query');
    if (q && !new RegExp(`^\\s*${NUM}\\s*,\\s*${NUM}\\s*$`).test(q)) name = q.replace(/\+/g, ' ').trim();
  }

  const coordsOk = lat !== undefined && lon !== undefined && isValidLatLon(lat, lon);
  if (!coordsOk && !name) return { ok: false, reason: 'No coordinates or place name found in that link.' };
  return { ok: true, lat: coordsOk ? lat : undefined, lon: coordsOk ? lon : undefined, name };
}

/** Allow only http(s) URLs for user-supplied reference links. */
export function sanitizeUrl(u: string | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const url = new URL(u.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
