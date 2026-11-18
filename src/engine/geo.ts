const R_MI = 3958.8;
const R_M = 6371008.8;

const toRad = (d: number) => (d * Math.PI) / 180;

function hav(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return hav(lat1, lon1, lat2, lon2) * R_MI;
}

export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return hav(lat1, lon1, lat2, lon2) * R_M;
}

/**
 * Rough nonstop-equivalent block time. ESTIMATE ONLY: real itineraries may connect.
 * ~500 mph cruise plus ~0.5 h for taxi/climb/descent.
 */
export function estimateFlightHours(miles: number): number {
  return Math.round((miles / 500 + 0.5) * 10) / 10;
}

export function isValidLatLon(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !(lat === 0 && lon === 0)
  );
}
