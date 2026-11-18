import type { Place, PlaceCategory } from './types';
import { distanceMeters } from '../engine/geo';

export const CATEGORIES: { id: PlaceCategory; label: string; color: string; defaultMin: number }[] = [
  { id: 'restaurant', label: 'Restaurants', color: '#e11d48', defaultMin: 75 },
  { id: 'cafe', label: 'Cafes', color: '#b45309', defaultMin: 40 },
  { id: 'attraction', label: 'Attractions', color: '#7c3aed', defaultMin: 90 },
  { id: 'nature', label: 'Hiking & nature', color: '#16a34a', defaultMin: 120 },
  { id: 'shopping', label: 'Shopping', color: '#db2777', defaultMin: 60 },
  { id: 'nightlife', label: 'Nightlife', color: '#4f46e5', defaultMin: 90 },
  { id: 'hotel', label: 'Hotels', color: '#0369a1', defaultMin: 30 },
  { id: 'transport', label: 'Transportation', color: '#475569', defaultMin: 20 },
  { id: 'custom', label: 'Custom', color: '#0f766e', defaultMin: 60 },
];

export const catMeta = (c: PlaceCategory) => CATEGORIES.find((x) => x.id === c) ?? CATEGORIES[CATEGORIES.length - 1];

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * A candidate is a duplicate if it has the same OSM reference, or a very similar name
 * within 75 m, or is essentially the same point (≤ 15 m) with an overlapping name.
 */
export function findDuplicate(existing: Place[], cand: { name: string; lat: number; lon: number; osmRef?: string }): Place | undefined {
  const n = norm(cand.name);
  return existing.find((p) => {
    if (cand.osmRef && p.osmRef && p.osmRef === cand.osmRef) return true;
    const d = distanceMeters(p.lat, p.lon, cand.lat, cand.lon);
    const pn = norm(p.name);
    if (pn === n && d < 75) return true;
    if (d < 15 && (pn.includes(n) || n.includes(pn))) return true;
    return false;
  });
}
