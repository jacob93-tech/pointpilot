import { afterEach, describe, expect, it, vi } from 'vitest';
import { airlineKey, fmtClock, fmtMinutes, parseFlights, partnersForAirlines } from '../src/engine/realFlights';
import relay from '../worker/serpapi-relay.js';

// Shape follows SerpApi's documented Google Flights response (best_flights / other_flights).
const SAMPLE = {
  best_flights: [
    {
      flights: [
        { departure_airport: { name: 'San Diego International Airport', id: 'SAN', time: '2027-04-09 06:00' }, arrival_airport: { name: 'Dallas/Fort Worth International Airport', id: 'DFW', time: '2027-04-09 11:05' }, duration: 185, airline: 'American', flight_number: 'AA 2401', airplane: 'Airbus A321' },
        { departure_airport: { name: 'Dallas/Fort Worth International Airport', id: 'DFW', time: '2027-04-09 12:30' }, arrival_airport: { name: 'Mexico City International Airport', id: 'MEX', time: '2027-04-09 15:10' }, duration: 160, airline: 'American', flight_number: 'AA 1155' },
      ],
      layovers: [{ duration: 85, name: 'Dallas/Fort Worth International Airport', id: 'DFW' }],
      total_duration: 430,
      price: 412,
      type: 'Round trip',
      airline_logo: 'https://www.gstatic.com/flights/airline_logos/70px/AA.png',
    },
  ],
  other_flights: [
    {
      flights: [{ departure_airport: { id: 'LAX', name: 'LAX', time: '2027-04-09 08:00' }, arrival_airport: { id: 'MEX', name: 'MEX', time: '2027-04-09 14:05' }, duration: 245, airline: 'Volaris', flight_number: 'Y4 921' }],
      total_duration: 245,
      price: 260,
    },
    { flights: [], price: 1 },
  ],
  price_insights: { lowest_price: 260, price_level: 'typical', typical_price_range: [240, 480] },
  google_flights_url: 'https://www.google.com/travel/flights?tfs=abc',
};

describe('parseFlights', () => {
  const r = parseFlights(SAMPLE);
  it('parses best and other flights, skipping empty itineraries', () => {
    expect(r.flights).toHaveLength(2);
    expect(r.flights[0]).toMatchObject({ price: 412, stops: 1, best: true, airlines: ['American'], totalMinutes: 430 });
    expect(r.flights[0].legs.map((l) => l.flightNumber)).toEqual(['AA 2401', 'AA 1155']);
    expect(r.flights[0].layovers[0]).toMatchObject({ code: 'DFW', minutes: 85 });
    expect(r.flights[1]).toMatchObject({ price: 260, stops: 0, best: false });
  });
  it('keeps price insights and the Google Flights link', () => {
    expect(r.priceLevel).toBe('typical');
    expect(r.typicalRange).toEqual([240, 480]);
    expect(r.googleUrl).toContain('google.com/travel/flights');
  });
  it('tolerates missing/garbage input', () => {
    expect(parseFlights(null).flights).toEqual([]);
    expect(parseFlights({ best_flights: 'x' }).flights).toEqual([]);
  });
});

describe('airline → Chase partner matching', () => {
  it('normalizes airline names', () => {
    expect(airlineKey('American Airlines')).toBe(airlineKey('American'));
    expect(airlineKey('Aeroméxico')).toBe('aeromexico');
    expect(airlineKey('Air Canada')).toBe('air canada');
  });
  it('maps oneworld, Star and SkyTeam carriers to the right programs', () => {
    expect(partnersForAirlines(['American'])).toContain('british-airways');
    expect(partnersForAirlines(['American'])).not.toContain('united');
    expect(partnersForAirlines(['United'])).toEqual(expect.arrayContaining(['united', 'aeroplan']));
    expect(partnersForAirlines(['Delta'])).toEqual(expect.arrayContaining(['flying-blue', 'virgin-atlantic']));
    expect(partnersForAirlines(['Southwest'])).toEqual(['southwest']);
  });
  it('a mixed itinerary needs a program that books every airline', () => {
    expect(partnersForAirlines(['American', 'Alaska'])).toContain('british-airways');
    expect(partnersForAirlines(['American', 'United'])).toEqual([]);
  });
  it('budget airlines have no Chase partner', () => {
    expect(partnersForAirlines(['Volaris'])).toEqual([]);
  });
});

describe('formatting', () => {
  it('formats durations and clock times', () => {
    expect(fmtMinutes(430)).toBe('7h 10m');
    expect(fmtMinutes(45)).toBe('45m');
    expect(fmtClock('2027-04-09 06:05')).toBe('6:05 AM');
    expect(fmtClock('2027-04-09 15:10')).toBe('3:10 PM');
    expect(fmtClock('2027-04-09 00:30')).toBe('12:30 AM');
  });
});

describe('Cloudflare Worker relay', () => {
  const env = { SERPAPI_KEY: 'secret-key', APP_TOKEN: 'correct-horse-battery', ALLOWED_ORIGINS: 'https://me.github.io,http://localhost:5173' };
  const req = (path: string, headers: Record<string, string> = {}, method = 'GET') => new Request(`https://relay.example.workers.dev${path}`, { method, headers });
  const good = { Origin: 'https://me.github.io', 'X-PointPilot-Token': 'correct-horse-battery' };
  afterEach(() => vi.unstubAllGlobals());

  it('rejects unknown origins and wrong tokens without calling SerpApi', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect((await relay.fetch(req('/quota', { Origin: 'https://evil.example', 'X-PointPilot-Token': 'correct-horse-battery' }), env)).status).toBe(403);
    expect((await relay.fetch(req('/quota', { Origin: 'https://me.github.io', 'X-PointPilot-Token': 'nope' }), env)).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it('answers CORS preflight for allowed origins only', async () => {
    const ok = await relay.fetch(req('/flights', { Origin: 'http://localhost:5173' }, 'OPTIONS'), env);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect((await relay.fetch(req('/flights', { Origin: 'https://evil.example' }, 'OPTIONS'), env)).status).toBe(403);
  });

  it('validates input before spending a search', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect((await relay.fetch(req('/flights?dep=SAN&arr=MEX&out=april', good), env)).status).toBe(400);
    expect((await relay.fetch(req('/flights?dep=SAN;DROP&arr=MEX&out=2027-04-09', good), env)).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('forwards a valid search with the secret key and strips metadata from the reply', async () => {
    const f = vi.fn(async (_url: string) => new Response(JSON.stringify({ ...SAMPLE, search_metadata: { google_flights_url: 'https://g/x', id: 'abc' }, search_parameters: { engine: 'google_flights' } }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    const res = await relay.fetch(req('/flights?dep=SAN,LAX&arr=MEX&out=2027-04-09&ret=2027-04-15&adults=2&cls=1', good), env);
    expect(res.status).toBe(200);
    const url = new URL(f.mock.calls[0][0]);
    expect(url.searchParams.get('engine')).toBe('google_flights');
    expect(url.searchParams.get('departure_id')).toBe('SAN,LAX');
    expect(url.searchParams.get('type')).toBe('1');
    expect(url.searchParams.get('adults')).toBe('2');
    expect(url.searchParams.get('api_key')).toBe('secret-key');
    const body = await res.json();
    expect(body.search_parameters).toBeUndefined();
    expect(body.google_flights_url).toBe('https://g/x');
    expect(JSON.stringify(body)).not.toContain('secret-key');
  });

  it('reports an exhausted free plan clearly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Your account has run out of searches.' }), { status: 429 })));
    const res = await relay.fetch(req('/flights?dep=SAN&arr=MEX&out=2027-04-09', good), env);
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe('quota');
  });
});
