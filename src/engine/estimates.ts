import type { Cabin, Range, Region } from '../lib/types';

/**
 * HEURISTIC ESTIMATE MODELS — clearly labeled as estimates throughout the UI.
 * They exist so the explorer can rank destinations before you have real quotes.
 * They are NOT prices. Record real cash/award quotes (Flights & Points) and the
 * engine uses yours instead.
 */

export const ESTIMATE_NOTE =
  'Rough heuristic range, not a quote. Real fares and dynamic award prices vary widely — check the search links and record what you find.';

/** Economy round-trip cash fare per person, from great-circle distance (one-way miles). */
export function estimateCashFare(miles: number, cabin: Cabin, domestic: boolean): Range {
  const lo = 90 + 0.085 * miles;
  const hi = 220 + 0.17 * miles;
  const [mLo, mHi] = cabinCashMultiplier(cabin, domestic, miles);
  return [round10(lo * mLo), round10(hi * mHi)];
}

function cabinCashMultiplier(cabin: Cabin, domestic: boolean, miles: number): Range {
  switch (cabin) {
    case 'economy':
      return [1, 1];
    case 'premium':
      return [1.5, 2.2];
    case 'business':
      return domestic || miles < 2000 ? [2, 3.2] : [3.5, 6];
    case 'first':
      return domestic || miles < 2000 ? [2.4, 4] : [5, 9];
  }
}

/**
 * Typical saver-level award range, partner miles per person round-trip, economy.
 * Based on general published-chart and historical dynamic-pricing levels for
 * the best commonly used Chase partners. Intentionally wide.
 */
export function estimateAwardMiles(miles: number, cabin: Cabin, domestic: boolean): Range {
  let base: Range;
  if (miles < 700) base = [12000, 25000];
  else if (miles < 1500) base = [15000, 35000];
  else if (miles < 3000) base = [20000, 50000];
  else if (miles < 4500) base = [40000, 80000];
  else if (miles < 7000) base = [55000, 100000];
  else base = [70000, 160000];
  const mult: Range =
    cabin === 'economy'
      ? [1, 1]
      : cabin === 'premium'
        ? [1.5, 2]
        : cabin === 'business'
          ? domestic || miles < 2000
            ? [2, 2.8]
            : [2.4, 3.5]
          : domestic || miles < 2000
            ? [2.4, 3.4]
            : [3.2, 5];
  return [round500(base[0] * mult[0]), round500(base[1] * mult[1])];
}

/** Award taxes & carrier surcharges, USD per person round-trip. */
export function estimateAwardFees(region: Region, domestic: boolean, cabin: Cabin): Range {
  if (domestic) return [11.2, 11.2];
  const premium = cabin === 'business' || cabin === 'first';
  switch (region) {
    case 'mexico':
    case 'canada':
    case 'caribbean':
    case 'central-america':
      return [50, 130];
    case 'europe':
      return premium ? [150, 1000] : [100, 500];
    case 'south-america':
      return [60, 200];
    case 'east-asia':
    case 'southeast-asia':
    case 'oceania':
      return premium ? [60, 400] : [40, 200];
    case 'middle-east':
    case 'africa':
      return [80, 350];
    default:
      return [11.2, 50];
  }
}

/** World of Hyatt standard-room chart (points per night), compiled from Hyatt's published chart. Verify on hyatt.com. */
export const HYATT_CHART: Record<number, { off: number; std: number; peak: number }> = {
  1: { off: 3500, std: 5000, peak: 6500 },
  2: { off: 6500, std: 8000, peak: 9500 },
  3: { off: 9000, std: 12000, peak: 15000 },
  4: { off: 12000, std: 15000, peak: 18000 },
  5: { off: 17000, std: 20000, peak: 23000 },
  6: { off: 21000, std: 25000, peak: 29000 },
  7: { off: 25000, std: 30000, peak: 35000 },
  8: { off: 35000, std: 40000, peak: 45000 },
};

/** Hyatt points per night range for a category spread — uses the LOWER part of the spread (practical hotels). */
export function estimateHyattNight(cats: Range): Range {
  const lo = HYATT_CHART[Math.max(1, Math.min(8, cats[0]))];
  const midCat = Math.min(8, Math.max(1, Math.round((cats[0] + cats[1]) / 2)));
  const hi = HYATT_CHART[midCat];
  return [lo.off, hi.peak];
}

export function mid(r: Range): number {
  return (r[0] + r[1]) / 2;
}

export function scaleRange(r: Range, k: number): Range {
  return [r[0] * k, r[1] * k];
}

export function addRanges(...rs: Range[]): Range {
  return rs.reduce<Range>((acc, r) => [acc[0] + r[0], acc[1] + r[1]], [0, 0]);
}

function round10(n: number) {
  return Math.round(n / 10) * 10;
}
function round500(n: number) {
  return Math.round(n / 500) * 500;
}
