import type {
  Cabin,
  DataQuality,
  DepartureAirport,
  Destination,
  PriorityPreset,
  Range,
  ScoreWeights,
  SearchParams,
  TripStyle,
} from '../lib/types';
import { DEST_AIRPORT_COORDS, DESTINATIONS } from '../data/destinations';
import { findAirport } from '../data/airports';
import { getCard } from '../data/cards';
import { distanceMiles, estimateFlightHours } from './geo';
import {
  addRanges,
  estimateAwardFees,
  estimateAwardMiles,
  estimateCashFare,
  estimateHyattNight,
  mid,
  scaleRange,
} from './estimates';

// ------------------------------------------------------------------ types

export interface WeatherStats {
  month: number;
  avgHighC: number;
  avgLowC: number;
  rainyDayPct: number;
  years: number[];
  fetchedAt: string;
}

/** A user-recorded real quote for a destination (from saved comparisons). */
export interface UserQuote {
  kind: 'flight' | 'hotel';
  cashPerPerson?: number; // flights
  cashPerNight?: number; // hotels
  pointsPerUnit: number | null; // per person (flight) or per night (hotel)
  feesPerUnit: number;
  label: string;
  verifiedAt?: string;
  awardAvailable: boolean;
}

export interface RankContext {
  minAcceptableCpp: number;
  weather: Record<string, WeatherStats | undefined>;
  quotes: Record<string, UserQuote[] | undefined>;
}

export type StrategyId = 'cash-both' | 'points-flight' | 'points-hotel' | 'points-both';

export interface Strategy {
  id: StrategyId;
  label: string;
  cash: number;
  cashRange: Range;
  points: number;
  pointsRange: Range;
  flightMethod: 'cash' | 'award' | 'chase-travel';
  hotelMethod: 'cash' | 'hyatt' | 'chase-travel';
  /** blended value per point used, cents */
  cpp: number | null;
  /** cash saved vs all-cash minus points × your minimum value */
  netValue: number;
  withinBudget: boolean;
  withinPoints: boolean;
}

export interface ComponentEstimate {
  cash: Range;
  quality: DataQuality;
  note: string;
}

export interface Scores {
  pointsValue: number;
  affordability: number;
  convenience: number;
  experiences: number;
  weather: number;
  preference: number;
}

export interface TripEstimate {
  destination: Destination;
  origin: DepartureAirport;
  originNote: string;
  distanceMi: number;
  flightHours: number;
  days: number;
  nights: number;
  rooms: number;
  flight: {
    cash: Range;
    awardPoints: Range | null;
    awardFees: Range;
    chaseTravelPoints: Range;
    awardCpp: number | null;
    quality: DataQuality;
    note: string;
  };
  hotel: {
    cash: Range;
    hyattPoints: Range | null;
    hyattCpp: number | null;
    quality: DataQuality;
    note: string;
  };
  onTheGround: Range;
  groundToAirport: number;
  allCash: Range;
  /** best value per point among points strategies your balance covers (ignores cash budget) */
  bestReachableCpp: number | null;
  strategies: Strategy[];
  recommended: Strategy;
  scores: Scores;
  overall: number;
  safetyFactor: number;
  weatherInfo: { quality: DataQuality; text: string };
  feasible: boolean;
  flags: string[];
  reasons: string[];
  estimateOnly: boolean;
}

export interface RankResult {
  results: TripEstimate[];
  hidden: { destination: Destination; reason: string }[];
  categories: CategoryPick[];
  notes: string[];
}

export interface CategoryPick {
  id: string;
  title: string;
  pick: TripEstimate | null;
  why: string;
}

// ------------------------------------------------------------------ presets

export const PRESET_WEIGHTS: Record<Exclude<PriorityPreset, 'custom'>, ScoreWeights> = {
  balanced: { pointsValue: 20, affordability: 25, convenience: 15, experiences: 15, weather: 10, preference: 15 },
  'points-value': { pointsValue: 45, affordability: 20, convenience: 10, experiences: 10, weather: 5, preference: 10 },
  'min-cash': { pointsValue: 15, affordability: 50, convenience: 10, experiences: 10, weather: 5, preference: 10 },
  experiences: { pointsValue: 10, affordability: 15, convenience: 10, experiences: 40, weather: 10, preference: 15 },
  'min-travel': { pointsValue: 10, affordability: 20, convenience: 45, experiences: 10, weather: 5, preference: 10 },
  'food-culture': { pointsValue: 10, affordability: 20, convenience: 10, experiences: 20, weather: 5, preference: 35 },
  outdoors: { pointsValue: 10, affordability: 20, convenience: 10, experiences: 20, weather: 15, preference: 25 },
};

export const PRESET_STYLES: Partial<Record<PriorityPreset, TripStyle[]>> = {
  'food-culture': ['food', 'culture'],
  outdoors: ['adventure', 'nature'],
};

export const PRESET_LABELS: Record<PriorityPreset, string> = {
  balanced: 'Balanced',
  'points-value': 'Maximize points value',
  'min-cash': 'Minimize out-of-pocket',
  experiences: 'Maximize experiences',
  'min-travel': 'Minimize travel time',
  'food-culture': 'Food & culture',
  outdoors: 'Outdoor activities',
  custom: 'Custom weights',
};

// ------------------------------------------------------------------ helpers

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n);
export const cToF = (c: number) => Math.round((c * 9) / 5 + 32);

function originDistance(origin: DepartureAirport, dest: Destination): number | null {
  const ap = findAirport(origin.code);
  if (!ap) return null;
  let best = Infinity;
  for (const code of dest.airports) {
    const c = DEST_AIRPORT_COORDS[code] ?? [dest.lat, dest.lon];
    best = Math.min(best, distanceMiles(ap.lat, ap.lon, c[0], c[1]));
  }
  return best;
}

export function tripLength(params: Pick<SearchParams, 'minDays' | 'maxDays'>): { days: number; nights: number } {
  const lo = Math.max(1, Math.min(params.minDays, params.maxDays));
  const hi = Math.max(lo, params.maxDays);
  const days = Math.round((lo + hi) / 2);
  return { days, nights: Math.max(1, days - 1) };
}

export function weatherScore(w: WeatherStats, styles: TripStyle[]): number {
  const beachy = styles.includes('beach');
  const [idealLo, idealHi] = beachy ? [26, 32] : [19, 29];
  const h = w.avgHighC;
  let s = 100;
  if (h < idealLo) s -= (idealLo - h) * 5;
  if (h > idealHi) s -= (h - idealHi) * 6;
  s -= w.rainyDayPct * 0.55;
  return clamp(round(s));
}

function fallbackWeather(dest: Destination, month: number): { score: number; text: string } {
  if (dest.bestMonths.includes(month)) return { score: 85, text: `Month ${month} is typically one of the best times to visit (general climate guidance).` };
  if (dest.okayMonths.includes(month)) return { score: 60, text: `Month ${month} is typically a reasonable but not peak time (general climate guidance).` };
  return { score: 30, text: `Month ${month} is typically off-season here (general climate guidance — weather, heat or rain).` };
}

// ------------------------------------------------------------------ core

export function estimateTrip(dest: Destination, params: SearchParams, ctx: RankContext, cabinOverride?: Cabin): TripEstimate | null {
  const cabin = cabinOverride ?? params.cabin;
  const card = getCard(params.cardId);
  const travelers = Math.max(1, params.travelers);
  const rooms = Math.ceil(travelers / 2);
  const { days, nights } = tripLength(params);
  const budgetPoints = Math.min(params.points, params.maxPoints > 0 ? params.maxPoints : Infinity);

  // ---- choose the cheapest departure airport including ground cost
  let bestOrigin: { o: DepartureAirport; dist: number; cost: number } | null = null;
  const originNotes: string[] = [];
  for (const o of params.airports) {
    const dist = originDistance(o, dest);
    if (dist == null) continue;
    const fare = mid(estimateCashFare(dist, cabin, dest.domestic)) * travelers + o.groundCost;
    if (!bestOrigin || fare < bestOrigin.cost) bestOrigin = { o, dist, cost: fare };
  }
  if (!bestOrigin) return null;
  const { o: origin, dist } = bestOrigin;
  if (params.airports.length > 1) {
    const home = params.airports.find((a) => a.isHome) ?? params.airports[0];
    if (origin.code !== home.code) originNotes.push(`${origin.code} estimated cheaper even after ~$${origin.groundCost} to get there.`);
    else originNotes.push(`${home.code} preferred — alternatives' estimated savings don't cover the ground cost.`);
  }
  const flightHours = estimateFlightHours(dist);

  // ---- flights
  const flightQuote = ctx.quotes[dest.id]?.find((q) => q.kind === 'flight' && q.cashPerPerson != null);
  const fareRange: Range = flightQuote ? [flightQuote.cashPerPerson!, flightQuote.cashPerPerson!] : estimateCashFare(dist, cabin, dest.domestic);
  const flightCash = scaleRange(fareRange, travelers);
  let awardPoints: Range | null;
  let awardFees: Range;
  if (flightQuote && flightQuote.pointsPerUnit) {
    awardPoints = scaleRange([flightQuote.pointsPerUnit, flightQuote.pointsPerUnit], travelers);
    awardFees = scaleRange([flightQuote.feesPerUnit, flightQuote.feesPerUnit], travelers);
  } else {
    // airline partners transfer 1:1; transfer bonuses are NOT assumed in estimates
    awardPoints = card.transferEligible ? scaleRange(estimateAwardMiles(dist, cabin, dest.domestic), travelers) : null;
    awardFees = scaleRange(estimateAwardFees(dest.region, dest.domestic, cabin), travelers);
  }
  const chaseTravelPoints: Range = [Math.ceil((flightCash[0] * 100) / card.travelBaseCpp), Math.ceil((flightCash[1] * 100) / card.travelBaseCpp)];
  const awardCpp = awardPoints ? ((mid(flightCash) - mid(awardFees)) / mid(awardPoints)) * 100 : null;

  // ---- hotel
  const hotelQuote = ctx.quotes[dest.id]?.find((q) => q.kind === 'hotel' && q.cashPerNight != null);
  const nightRange: Range = hotelQuote ? [hotelQuote.cashPerNight!, hotelQuote.cashPerNight!] : dest.costs.hotelNight;
  const hotelCash = scaleRange(nightRange, nights * rooms);
  let hyattPoints: Range | null = null;
  if (hotelQuote?.pointsPerUnit) hyattPoints = scaleRange([hotelQuote.pointsPerUnit, hotelQuote.pointsPerUnit], nights * rooms);
  else if (card.transferEligible && dest.hyattCategories) {
    const perNight = estimateHyattNight(dest.hyattCategories);
    const ratio = card.ratioOverrides?.['world-of-hyatt'] ?? { chase: 1, partner: 1 };
    // Chase points needed (ratio applied; rounded to 1,000 transfer increments for the total)
    const toChase = (n: number) => Math.ceil((n * nights * rooms * ratio.chase) / ratio.partner / 1000) * 1000;
    hyattPoints = [toChase(perNight[0]), toChase(perNight[1])];
  }
  // value hotel points at what you'd otherwise pay for a comparable mid-range room — not luxury rack rates
  const hyattCpp = hyattPoints ? (mid(hotelCash) / mid(hyattPoints)) * 100 : null;

  // ---- on the ground
  const onTheGround = addRanges(
    scaleRange(dest.costs.foodDay, days * travelers),
    scaleRange(dest.costs.localDay, days * travelers),
    scaleRange(dest.costs.activityDay, days * travelers),
  );
  const groundToAirport = origin.groundCost;
  const allCash = addRanges(flightCash, hotelCash, onTheGround, [groundToAirport, groundToAirport]);

  // ---- strategies
  const flightPts = pickFlightPoints(awardPoints, awardFees, awardCpp, chaseTravelPoints, card.travelBaseCpp);
  const hotelPts = pickHotelPoints(hyattPoints, hyattCpp, hotelCash, card.travelBaseCpp);
  const allCashMid = mid(allCash);
  const fixedCash = addRanges(onTheGround, [groundToAirport, groundToAirport]);

  const make = (id: StrategyId, useF: boolean, useH: boolean): Strategy => {
    const cashRange = addRanges(fixedCash, useF ? flightPts.fees : flightCash, useH ? [0, 0] : hotelCash);
    const pointsRange = addRanges(useF ? flightPts.points : [0, 0], useH ? hotelPts.points : [0, 0]);
    const cash = mid(cashRange);
    const points = mid(pointsRange);
    const saved = allCashMid - cash;
    const cpp = points > 0 ? (saved / points) * 100 : null;
    return {
      id,
      label:
        id === 'cash-both' ? 'Cash for flights & hotel' : id === 'points-flight' ? 'Points for flights, cash for hotel' : id === 'points-hotel' ? 'Cash for flights, points for hotel' : 'Points for flights & hotel',
      cash,
      cashRange,
      points,
      pointsRange,
      flightMethod: useF ? flightPts.method : 'cash',
      hotelMethod: useH ? hotelPts.method : 'cash',
      cpp,
      netValue: saved - (points * ctx.minAcceptableCpp) / 100,
      withinBudget: cash <= params.maxCash,
      withinPoints: points <= budgetPoints,
    };
  };
  const strategies = [make('cash-both', false, false), make('points-flight', true, false), make('points-hotel', false, true), make('points-both', true, true)];
  const feasibleS = strategies.filter((s) => s.withinBudget && s.withinPoints);
  let recommended: Strategy;
  const flags: string[] = [];
  if (feasibleS.length) {
    recommended = [...feasibleS].sort((a, b) => b.netValue - a.netValue || a.points - b.points)[0];
  } else {
    const pointsOk = strategies.filter((s) => s.withinPoints);
    recommended = [...pointsOk].sort((a, b) => a.cash - b.cash)[0] ?? strategies[0];
    flags.push(`Over budget: est. $${round(recommended.cash).toLocaleString()} cash vs $${params.maxCash.toLocaleString()} budget`);
  }
  if (strategies.slice(1).every((s) => !s.withinPoints)) flags.push('Not enough points for any points strategy (est.)');

  // ---- scores
  // Only value the user can actually reach counts: theoretical cpp on unaffordable redemptions is ignored.
  const reachable = strategies.filter((s) => s.points > 0 && s.withinPoints && s.cpp != null).map((s) => s.cpp!);
  const usedCpp = recommended.cpp ?? (reachable.length ? Math.max(...reachable) : card.travelBaseCpp);
  const pointsValue = clamp(round(((Math.min(usedCpp, 2.0) - 0.6) / 1.4) * 100));
  const ratio = recommended.cash / Math.max(1, params.maxCash);
  let affordability = clamp(round(100 - ((ratio - 0.4) / 1.0) * 100));
  if (!recommended.withinPoints) affordability = round(affordability * 0.5);

  const home = params.airports.find((a) => a.isHome) ?? params.airports[0];
  const homeAp = findAirport(home?.code ?? 'SAN');
  const homeOffset = homeAp && homeAp.lon < -114 ? -8 : -6;
  const tzDiff = Math.min(24 - Math.abs(dest.utcOffset - homeOffset), Math.abs(dest.utcOffset - homeOffset));
  let convenience = 100 - Math.max(0, flightHours + origin.groundHours - 1.5) * 6 - tzDiff * 2.5;
  if (days <= 4 && flightHours > 5) convenience -= (flightHours - 5) * 5;
  convenience = clamp(round(convenience));

  const expVals = Object.values(dest.experience).sort((a, b) => (b ?? 0) - (a ?? 0));
  const experiences = clamp(round(((expVals.slice(0, 3).reduce((s, v) => s + (v ?? 0), 0) / 3) / 5) * 100));

  const styles = params.styles.length ? params.styles : PRESET_STYLES[params.priority] ?? [];
  let preference = styles.length ? round((styles.reduce((s, st) => s + (dest.experience[st] ?? 1), 0) / styles.length / 5) * 100) : 70;
  if (params.preferred.includes(dest.id)) preference = clamp(preference + 20);

  const w = ctx.weather[dest.id];
  let weather: number;
  let weatherInfo: TripEstimate['weatherInfo'];
  if (w && w.month === params.month) {
    weather = weatherScore(w, styles);
    weatherInfo = {
      quality: 'cached',
      text: `Observed ${monthName(params.month)} weather ${w.years[0]}–${w.years[w.years.length - 1]}: avg high ${cToF(w.avgHighC)}°F (${Math.round(w.avgHighC)}°C), ≥2 mm rain on ${Math.round(w.rainyDayPct)}% of days. Modeled historical data (reanalysis via Open-Meteo), not a forecast.`,
    };
  } else {
    const fb = fallbackWeather(dest, params.month);
    weather = fb.score;
    weatherInfo = { quality: 'estimate', text: fb.text };
  }

  const scores: Scores = { pointsValue, affordability, convenience, experiences, weather, preference };
  const weights = params.priority === 'custom' ? params.weights : PRESET_WEIGHTS[params.priority];
  const wSum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  let overall = (Object.keys(scores) as (keyof Scores)[]).reduce((s, k) => s + scores[k] * weights[k], 0) / wSum;

  const safetyFactor = dest.domestic ? 1 : dest.advisoryLevel === 1 ? 1 : dest.advisoryLevel === 2 ? 0.97 : dest.advisoryLevel === 3 ? 0.8 : dest.advisoryLevel === 4 ? 0.4 : 0.95;
  overall *= safetyFactor;
  if (!recommended.withinBudget) overall -= 12;
  if (!recommended.withinPoints) overall -= 25;
  overall = clamp(round(overall));

  if (dest.advisoryLevel && dest.advisoryLevel >= 3) flags.push(`Last-known State Dept advisory level ${dest.advisoryLevel} — verify before planning`);
  if (params.maxLayovers != null) flags.push('Layover limits can’t be checked without live schedules');

  const feasible = recommended.withinBudget && recommended.withinPoints;
  const estimateOnly = !flightQuote && !hotelQuote;

  const reasons = buildReasons({
    dest, recommended, params, flightHours, origin, awardCpp, hyattCpp, weatherInfo, styles, scores, flightQuote: !!flightQuote, hotelQuote: !!hotelQuote, minCpp: ctx.minAcceptableCpp, baseCpp: card.travelBaseCpp,
  });

  return {
    destination: dest,
    origin,
    originNote: originNotes.join(' '),
    distanceMi: round(dist),
    flightHours,
    days,
    nights,
    rooms,
    flight: {
      cash: flightCash,
      awardPoints,
      awardFees,
      chaseTravelPoints,
      awardCpp,
      quality: flightQuote ? 'user' : 'estimate',
      note: flightQuote ? `Using your recorded quote: ${flightQuote.label}` : 'Distance-based estimate — not a fare quote.',
    },
    hotel: {
      cash: hotelCash,
      hyattPoints,
      hyattCpp,
      quality: hotelQuote ? 'user' : 'estimate',
      note: hotelQuote ? `Using your recorded quote: ${hotelQuote.label}` : `Mid-range estimate × ${nights} night${nights > 1 ? 's' : ''} × ${rooms} room${rooms > 1 ? 's' : ''}.`,
    },
    onTheGround,
    groundToAirport,
    allCash,
    bestReachableCpp: reachable.length ? Math.max(...reachable) : null,
    strategies,
    recommended,
    scores,
    overall,
    safetyFactor,
    weatherInfo,
    feasible,
    flags,
    reasons,
    estimateOnly,
  };
}

function pickFlightPoints(award: Range | null, fees: Range, awardCpp: number | null, ct: Range, baseCpp: number) {
  if (award && awardCpp != null && awardCpp > baseCpp) return { method: 'award' as const, points: award, fees };
  return { method: 'chase-travel' as const, points: ct, fees: [0, 0] as Range };
}

function pickHotelPoints(hyatt: Range | null, hyattCpp: number | null, hotelCash: Range, baseCpp: number) {
  if (hyatt && hyattCpp != null && hyattCpp > baseCpp) return { method: 'hyatt' as const, points: hyatt };
  return { method: 'chase-travel' as const, points: [Math.ceil((hotelCash[0] * 100) / baseCpp), Math.ceil((hotelCash[1] * 100) / baseCpp)] as Range };
}

export function monthName(m: number): string {
  return new Date(2000, m - 1, 1).toLocaleString('en-US', { month: 'long' });
}

const methodLabel = (m: Strategy['flightMethod'] | Strategy['hotelMethod']) =>
  m === 'award' ? 'a partner award' : m === 'chase-travel' ? 'Chase Travel' : m === 'hyatt' ? 'World of Hyatt points' : 'cash';

function buildReasons(a: {
  dest: Destination; recommended: Strategy; params: SearchParams; flightHours: number; origin: DepartureAirport; awardCpp: number | null; hyattCpp: number | null;
  weatherInfo: TripEstimate['weatherInfo']; styles: TripStyle[]; scores: Scores; flightQuote: boolean; hotelQuote: boolean; minCpp: number; baseCpp: number;
}): string[] {
  const r: string[] = [];
  const s = a.recommended;
  const est = a.flightQuote || a.hotelQuote ? '' : 'est. ';
  r.push(
    `${s.label}: ${est}$${round(s.cashRange[0]).toLocaleString()}–$${round(s.cashRange[1]).toLocaleString()} out of pocket${s.points ? ` + ~${(Math.round(s.points / 1000) * 1000).toLocaleString()} points` : ''} — ${s.withinBudget ? 'within' : 'over'} your $${a.params.maxCash.toLocaleString()} budget.`,
  );
  if (s.id === 'cash-both') r.push(`Paying cash looks better than spending points here — estimated point values don't beat your ${a.minCpp.toFixed(2)}¢ minimum. Save the points.`);
  else {
    if (s.flightMethod !== 'cash') r.push(`Flights via ${methodLabel(s.flightMethod)}${a.awardCpp != null && s.flightMethod === 'award' ? ` (~${a.awardCpp.toFixed(2)}¢/pt est.)` : ` (${a.baseCpp.toFixed(2)}¢/pt)`}.`);
    if (s.hotelMethod !== 'cash') r.push(`Hotel via ${methodLabel(s.hotelMethod)}${a.hyattCpp != null && s.hotelMethod === 'hyatt' ? ` (~${a.hyattCpp.toFixed(2)}¢/pt vs a comparable mid-range room)` : ''}.`);
  }
  r.push(`≈${a.flightHours} h nonstop-equivalent from ${a.origin.code}${a.origin.groundCost ? ` (+$${a.origin.groundCost} to reach the airport)` : ''}; connections add time.`);
  r.push(a.weatherInfo.text);
  if (a.styles.length) {
    const strong = a.styles.filter((st) => (a.dest.experience[st] ?? 0) >= 4);
    r.push(strong.length ? `Strong for ${strong.join(', ')} (editorial rating).` : `Weak match for ${a.styles.join(', ')} (editorial rating).`);
  }
  return r;
}

// ------------------------------------------------------------------ rank all

export function rankDestinations(params: SearchParams, ctx: RankContext, catalog: Destination[] = DESTINATIONS): RankResult {
  const results: TripEstimate[] = [];
  const hidden: RankResult['hidden'] = [];
  for (const d of catalog) {
    if (params.excluded.includes(d.id)) { hidden.push({ destination: d, reason: 'Excluded by you' }); continue; }
    if (params.scope === 'domestic' && !d.domestic) { hidden.push({ destination: d, reason: 'International' }); continue; }
    if (params.scope === 'international' && d.domestic) { hidden.push({ destination: d, reason: 'Domestic' }); continue; }
    const t = estimateTrip(d, params, ctx);
    if (!t) { hidden.push({ destination: d, reason: 'No valid departure airport' }); continue; }
    if (params.maxFlightHours != null && t.flightHours > params.maxFlightHours) {
      hidden.push({ destination: d, reason: `Est. flight ${t.flightHours} h > ${params.maxFlightHours} h` });
      continue;
    }
    results.push(t);
  }
  results.sort((a, b) => b.overall - a.overall);

  const notes = [
    'All prices are estimates unless marked "Your quote". Search links open real searches — they do not confirm availability.',
    'Award estimates assume typical saver-level pricing and no transfer bonus.',
  ];
  if (params.maxLayovers != null) notes.push('Max layovers can’t be applied to estimates; it’s saved for when you record real itineraries.');

  return { results, hidden, categories: pickCategories(results, params, ctx, catalog), notes };
}

function best(list: TripEstimate[], key: (t: TripEstimate) => number): TripEstimate | null {
  return list.length ? [...list].sort((a, b) => key(b) - key(a))[0] : null;
}

function pickCategories(results: TripEstimate[], params: SearchParams, ctx: RankContext, catalog: Destination[]): CategoryPick[] {
  const feasible = results.filter((r) => r.feasible);
  const pointsOk = results.filter((r) => r.recommended.withinPoints);
  const strong = (st: TripStyle, n = 4) => (r: TripEstimate) => (r.destination.experience[st] ?? 0) >= n;

  /** Prefer trips that fit budget AND points; otherwise show the best that fits the points, flagged. */
  const pick = (id: string, title: string, why: string, filter: (r: TripEstimate) => boolean, key: (r: TripEstimate) => number): CategoryPick => {
    const a = best(feasible.filter(filter), key);
    if (a) return { id, title, pick: a, why };
    const b = best(pointsOk.filter(filter), key);
    return { id, title, pick: b, why: b ? `${why} Nothing in this category fits your full cash budget, so this is the closest option.` : why };
  };
  const cheapestOf = (list: TripEstimate[]) => (list.length ? [...list].sort((x, y) => x.recommended.cash - y.recommended.cash)[0] : null);

  // premium cabin: recompute in business; must fit the points balance
  let premium: TripEstimate | null = null;
  if (params.cabin === 'economy' || params.cabin === 'premium') {
    const prem = catalog
      .filter((d) => !params.excluded.includes(d.id) && (params.scope === 'both' || (params.scope === 'domestic') === d.domestic))
      .map((d) => estimateTrip(d, params, ctx, 'business'))
      .filter((t): t is TripEstimate => !!t && !!t.flight.awardPoints && mid(t.flight.awardPoints) <= Math.min(params.points, params.maxPoints || Infinity));
    premium = best(prem, (t) => (t.flight.awardCpp ?? 0) * 10 + t.overall / 10);
  } else premium = best(pointsOk, (t) => t.flight.awardCpp ?? 0);

  return [
    pick('overall-value', 'Best overall points value', 'Highest estimated value per point you can actually reach with your balance.', (r) => r.bestReachableCpp != null, (r) => (r.bestReachableCpp ?? 0) * 100 + r.overall / 10),
    { id: 'cheapest', title: 'Cheapest trip', pick: cheapestOf(feasible) ?? cheapestOf(pointsOk), why: 'Lowest estimated out-of-pocket cash using the recommended mix.' },
    pick('international', 'Best international destination', 'Top overall score outside the US.', (r) => !r.destination.domestic, (r) => r.overall),
    pick('beach', 'Best beach vacation', 'Top overall score among strong beach destinations.', strong('beach'), (r) => r.overall),
    pick('food', 'Best food destination', 'Top overall score among top-rated food cities.', strong('food', 5), (r) => r.overall),
    pick('adventure', 'Best adventure trip', 'Top overall score among top adventure destinations.', strong('adventure', 5), (r) => r.overall),
    pick('weekend', 'Best weekend getaway', 'Best overall score with an estimated flight of 3.5 h or less.', (r) => r.flightHours <= 3.5, (r) => r.overall),
    { id: 'premium', title: 'Best premium cabin redemption', pick: premium, why: 'Highest estimated business-class value that fits your balance. Theoretical — premium cash fares are rarely what you’d actually pay.' },
    { id: 'under-budget', title: 'Best vacation under your cash budget', pick: best(feasible, (r) => r.overall), why: `Highest overall score that fits $${params.maxCash.toLocaleString()} and your points.` },
  ];
}
