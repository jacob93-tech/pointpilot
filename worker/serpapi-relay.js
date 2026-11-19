/**
 * PointPilot real-flight relay — a Cloudflare Worker (free plan).
 *
 * Why it exists: SerpApi blocks direct browser calls so an API key is never exposed
 * in a web page. This Worker keeps the key as a Cloudflare secret, accepts only
 * requests carrying your private app token from your own site, and forwards a small,
 * validated set of Google Flights search parameters to SerpApi.
 *
 * Secrets / variables (set in the Cloudflare dashboard → Worker → Settings → Variables and Secrets):
 *   SERPAPI_KEY      (secret)  your SerpApi API key
 *   APP_TOKEN        (secret)  any long random passphrase; also typed into PointPilot → Settings
 *   ALLOWED_ORIGINS  (text)    comma-separated, e.g. https://you.github.io,http://localhost:5173
 *
 * Cost: the Worker free plan needs no paid add-ons; SerpApi's free plan simply stops
 * returning results when its monthly searches run out — with no card on file there is
 * nothing to charge.
 */

const IATA_LIST = /^[A-Z]{3}(,[A-Z]{3}){0,4}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SERPAPI = 'https://serpapi.com';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const originOk = allowed.includes(origin);
    const cors = originOk
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'X-PointPilot-Token',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        }
      : { Vary: 'Origin' };

    if (request.method === 'OPTIONS') return new Response(null, { status: originOk ? 204 : 403, headers: cors });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, cors);
    if (!originOk) return json({ error: 'This site is not allowed to use this relay.' }, 403, cors);
    if (!env.SERPAPI_KEY || !env.APP_TOKEN) return json({ error: 'Relay is missing its SERPAPI_KEY or APP_TOKEN secret.', code: 'not-configured' }, 500, cors);
    if (!safeEqual(request.headers.get('X-PointPilot-Token') || '', env.APP_TOKEN)) {
      return json({ error: 'Wrong app token. Check PointPilot → Settings → Real flight search.', code: 'bad-token' }, 401, cors);
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === '/quota') return await quota(env, cors);
      if (url.pathname === '/flights') return await flights(url.searchParams, env, cors);
      return json({ error: 'Not found' }, 404, cors);
    } catch {
      return json({ error: 'The relay could not reach SerpApi.', code: 'upstream' }, 502, cors);
    }
  },
};

async function quota(env, cors) {
  // SerpApi's Account API is free and does not use a search.
  const r = await fetch(`${SERPAPI}/account.json?api_key=${encodeURIComponent(env.SERPAPI_KEY)}`);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: body.error || `SerpApi account check failed (HTTP ${r.status}).`, code: r.status === 401 ? 'bad-key' : 'upstream' }, r.status, cors);
  return json(
    {
      plan: body.plan_name ?? null,
      searchesPerMonth: body.searches_per_month ?? null,
      searchesLeft: body.plan_searches_left ?? body.total_searches_left ?? null,
      usedThisMonth: body.this_month_usage ?? null,
    },
    200,
    cors,
  );
}

async function flights(q, env, cors) {
  const dep = (q.get('dep') || '').toUpperCase();
  const arr = (q.get('arr') || '').toUpperCase();
  const out = q.get('out') || '';
  const ret = q.get('ret') || '';
  const adults = Number(q.get('adults') || '1');
  const cls = Number(q.get('cls') || '1');
  if (!IATA_LIST.test(dep) || !IATA_LIST.test(arr)) return json({ error: 'Airports must be 3-letter codes.', code: 'bad-request' }, 400, cors);
  if (!DATE.test(out) || (ret && !DATE.test(ret))) return json({ error: 'Dates must be YYYY-MM-DD.', code: 'bad-request' }, 400, cors);
  if (!Number.isInteger(adults) || adults < 1 || adults > 9) return json({ error: 'Travelers must be 1–9.', code: 'bad-request' }, 400, cors);
  if (![1, 2, 3, 4].includes(cls)) return json({ error: 'Bad cabin.', code: 'bad-request' }, 400, cors);

  const p = new URLSearchParams({
    engine: 'google_flights',
    departure_id: dep,
    arrival_id: arr,
    outbound_date: out,
    type: ret ? '1' : '2',
    adults: String(adults),
    travel_class: String(cls),
    currency: 'USD',
    hl: 'en',
    gl: 'us',
    api_key: env.SERPAPI_KEY,
  });
  if (ret) p.set('return_date', ret);

  const r = await fetch(`${SERPAPI}/search.json?${p}`);
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.error) {
    const msg = String(body.error || `SerpApi error (HTTP ${r.status}).`);
    const code = /run out of searches/i.test(msg) ? 'quota' : r.status === 401 ? 'bad-key' : /hasn't returned any results/i.test(msg) ? 'no-results' : 'upstream';
    return json({ error: msg, code }, code === 'no-results' ? 200 : r.status >= 400 ? r.status : 502, cors);
  }
  // Return only what the app needs — never echo request metadata (it can include account details).
  return json(
    {
      best_flights: body.best_flights ?? [],
      other_flights: body.other_flights ?? [],
      price_insights: body.price_insights ?? null,
      google_flights_url: body.search_metadata?.google_flights_url ?? null,
    },
    200,
    cors,
  );
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
