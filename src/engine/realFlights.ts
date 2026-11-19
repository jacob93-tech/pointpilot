import { PROGRAM_GUIDES } from '../data/programs';

/**
 * Real Google Flights results (via the user's own SerpApi relay), parsed into a
 * compact shape, plus matching each flight's airlines to the Chase partners that
 * can book them. Pure functions — no network here.
 */

export interface RealLeg {
  airline: string;
  flightNumber: string;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  depart: string; // "2027-04-09 06:15" local time
  arrive: string;
  minutes: number;
  airplane?: string;
  overnight?: boolean;
}

export interface RealFlight {
  id: string;
  /** Price exactly as Google Flights returned it, USD; null if Google showed none */
  price: number | null;
  legs: RealLeg[];
  layovers: { code: string; name: string; minutes: number; overnight?: boolean }[];
  totalMinutes: number;
  stops: number;
  airlines: string[];
  airlineLogo?: string;
  best: boolean;
}

export interface RealFlightResult {
  flights: RealFlight[];
  priceLevel?: string;
  typicalRange?: [number, number];
  lowestPrice?: number;
  googleUrl?: string;
}

type Raw = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function parseFlights(body: unknown): RealFlightResult {
  const b = (body && typeof body === 'object' ? body : {}) as Raw;
  const take = (arr: unknown, best: boolean): RealFlight[] =>
    (Array.isArray(arr) ? arr : []).flatMap((it, i) => {
      const o = (it ?? {}) as Raw;
      const legsRaw = Array.isArray(o.flights) ? (o.flights as Raw[]) : [];
      if (!legsRaw.length) return [];
      const legs: RealLeg[] = legsRaw.map((l) => {
        const d = (l.departure_airport ?? {}) as Raw;
        const a = (l.arrival_airport ?? {}) as Raw;
        return {
          airline: str(l.airline),
          flightNumber: str(l.flight_number),
          from: str(d.id),
          fromName: str(d.name),
          to: str(a.id),
          toName: str(a.name),
          depart: str(d.time),
          arrive: str(a.time),
          minutes: num(l.duration) ?? 0,
          airplane: str(l.airplane) || undefined,
          overnight: l.overnight === true || undefined,
        };
      });
      const layovers = (Array.isArray(o.layovers) ? (o.layovers as Raw[]) : []).map((l) => ({
        code: str(l.id),
        name: str(l.name),
        minutes: num(l.duration) ?? 0,
        overnight: l.overnight === true || undefined,
      }));
      const airlines = [...new Set(legs.map((l) => l.airline).filter(Boolean))];
      return [
        {
          id: `${best ? 'b' : 'o'}${i}-${legs.map((l) => l.flightNumber).join('_')}`,
          price: num(o.price),
          legs,
          layovers,
          totalMinutes: num(o.total_duration) ?? legs.reduce((s, l) => s + l.minutes, 0),
          stops: Math.max(0, legs.length - 1),
          airlines,
          airlineLogo: str(o.airline_logo) || undefined,
          best,
        },
      ];
    });
  const flights = [...take(b.best_flights, true), ...take(b.other_flights, false)];
  const pi = (b.price_insights ?? {}) as Raw;
  const tr = Array.isArray(pi.typical_price_range) ? (pi.typical_price_range as unknown[]).map(num) : [];
  return {
    flights,
    priceLevel: str(pi.price_level) || undefined,
    lowestPrice: num(pi.lowest_price) ?? undefined,
    typicalRange: tr.length === 2 && tr[0] != null && tr[1] != null ? [tr[0], tr[1]] : undefined,
    googleUrl: str(b.google_flights_url) || undefined,
  };
}

/** "American Airlines" / "American" / "Aeroméxico" → comparable key */
export function airlineKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(air ?lines?|airways)\b/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Chase partner ids whose program can book EVERY airline on this itinerary
 * (by the compiled partner lists). Empty = book with cash / Chase Travel.
 */
export function partnersForAirlines(airlines: string[]): string[] {
  if (!airlines.length) return [];
  const keys = airlines.map(airlineKey);
  return PROGRAM_GUIDES.filter((g) => {
    const books = g.books.map(airlineKey);
    return keys.every((k) => books.includes(k));
  }).map((g) => g.partnerId);
}

export function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h ? `${h}h ${mm ? `${mm}m` : ''}`.trim() : `${mm}m`;
}

/** "2027-04-09 06:15" → "6:15 AM" (local airport time, as Google shows it) */
export function fmtClock(t: string): string {
  const m = /(\d{2}):(\d{2})$/.exec(t);
  if (!m) return t;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}
