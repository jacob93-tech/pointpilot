# PointPilot

**Where can my Chase points take me?** A free, local-first web app that helps you decide where to travel with Chase Ultimate Rewards points and how to pay (transfer, Chase Travel, cash, or a mix), then plan the trip: places, map, day-by-day itinerary and budget.

- **$0, no accounts, no API keys, no billing anywhere.** It's a static site, and your data lives in your browser (IndexedDB).
- **Honest by design.** Every number carries a label: *Live*, *Cached*, *Your quote*, *Needs verification*, *Estimate* or *Example*. Nothing pretends to be a live fare, live award space or an active bonus when it isn't.

---

## 1. Architecture assessment (why it's built this way)

| Question | Decision |
|---|---|
| Stack | Vite + React 18 + TypeScript + Tailwind CSS v4, Dexie (IndexedDB), Leaflet + OpenStreetMap, dnd-kit, vite-plugin-pwa |
| Backend | **None.** All logic is deterministic TypeScript running in the browser, so free static hosting is enough |
| Storage | IndexedDB (via Dexie), with JSON export/import |
| Hosting | GitHub Pages (workflow included) or Cloudflare Pages. Both are free with no card. The build uses relative paths and hash routing, so it works at any URL |
| AI | Not needed. Ranking, value-per-point math and route optimization are deterministic algorithms |

### Which travel data sources are realistically free (checked November 2026)

| Data | Free, permitted source? | What PointPilot does |
|---|---|---|
| Cash airfares | **No.** Google Flights has no public API. Amadeus Self-Service is being retired. Kiwi/Skyscanner need partnerships | Distance-based **estimates** (labeled), **prefilled Google Flights/Kayak links**, and **manual quote entry** that replaces estimates in rankings |
| Award availability | **No.** Seats.aero, ExpertFlyer etc. are paid, and airline sites forbid scraping | **Prefilled award-search links** (United, Aeroplan, Southwest, JetBlue) plus landing links for other partners, and manual award entry with an availability status |
| Transfer bonuses | **No public feed.** Chase's transfer screen requires login | Seeded from public reports (2026-11-18) as **Needs verification**, a one-click "I verified this on Chase" button, and a manual tracker. Status is **computed from dates** so expired bonuses can't show as active |
| Transfer partners and ratios | No official machine-readable list | Seeded from public reports (incl. Hyatt 4:3 on Sapphire Preferred / Ink Preferred, Wyndham, and Cathay/Qantas flagged as newly reported). Editable and user-verifiable |
| Hotel cash prices | No | Mid-range **estimates**, Google Hotels / Hyatt / Marriott links, manual quotes |
| Hotel award prices | Hyatt publishes a chart | Hyatt category-chart estimates (with card ratio applied); others are dynamic, so you enter them manually |
| Weather | **Yes.** Open-Meteo archive (free, no key) | 3 years of modeled history for your travel month, cached 90 days. Falls back to general climate guidance |
| Maps / geocoding | **Yes.** OpenStreetMap tiles + Nominatim (Photon fallback) | ≤1 request/second, search on submit only, results cached 30 days, attribution shown |
| Routing | **Yes (fair use).** FOSSGIS OSRM + OSRM demo | Walking/driving/cycling matrix + route lines. **No free transit**, so the app links to Google Maps transit directions |
| Exchange rates | **Yes.** Frankfurter (ECB reference rates) | Cached 12 h, falls back to the last rates or a manual rate |
| Destination photos | **Yes.** Wikipedia REST summary (Wikimedia Commons) | Lazy-loaded with an attribution link |
| Travel advisories | State Dept has no CORS-friendly feed | Last-known level (developer-seeded, labeled "may be outdated") plus a link to travel.state.gov |

### What's automated vs manual

- **Automated (free):** ranking, transfer math, value-per-point calculations, strategy selection, flexible-date generation, weather history, place search, routing, route optimization, FX conversion, photos.
- **Manual (by necessity):** cash fares, award prices and availability, confirming transfer bonuses and partner ratios on Chase, and travel-advisory levels.

### Hosting and storage limits

- Data is stored **only in the browser you use**. Clearing site data, private browsing, or switching devices loses it unless you **export** (Settings → Export everything, or per trip). The app asks the browser for persistent storage.
- Free services have fair-use limits (Nominatim 1 req/s, Open-Meteo per-minute limits, donation-run OSRM servers). The app throttles, caches and degrades gracefully when they refuse or fail.

---

## 2. Features

### Points optimization (the core)

- **Explore: "Where can my Chase points take me?"** Search with no destination: points, card, multiple departure airports with **ground costs** (so a cheaper LAX fare doesn't automatically beat SAN), month/year, flexible / weekend / range / specific dates (calendar), trip length range, travelers, cabin, cash and points caps, domestic/international, preferred/excluded destinations, max layovers (kept for real itineraries), max flight time, and trip styles.
- **59-destination catalog** with real coordinates, airports and time zones. It also has estimated cost ranges, editorial experience ratings, Hyatt category spreads and best months, all labeled as estimates.
- **Ranking engine** with six scores (points value, cash affordability, convenience, experiences, weather, preference match), seven presets plus custom weights, safety-advisory and budget/points penalties, and a written explanation for every destination.
  - Points-value scoring caps at 2¢ and only counts value you can **reach with your balance**, so a theoretical first-class redemption can't outrank a practical trip.
- **Category picks:** best overall points value, cheapest, best international, beach, food, adventure, weekend getaway, premium cabin (clearly labeled theoretical), and best under budget. If nothing in a category fits your budget, it says so and shows the closest option.
- **Four payment strategies per destination:** cash/cash, points flight + cash hotel, cash flight + points hotel, points/points. Each part uses the best method (partner award, Chase Travel, or Hyatt). The recommendation is the mix inside your limits that saves the most cash **after charging each point at your minimum value**, so paying cash wins when points are weak.
- **Cash-vs-points comparisons (Flights & Points):** record a real cash price (source, date, link) and any number of award options (partner miles, taxes, availability status, source). You get Chase points needed after **verified** bonuses (unverified ones are shown as an "if real" scenario), ¢/pt, cash saved, remaining balance, verdicts relative to your card's floor and your own minimum, availability warnings, and opportunity cost. Linked comparisons **replace the estimates** in Explore rankings.
- **Smart redemption calculator:** per-person or total pricing, Chase Travel (base or your price), optional Points Boost scenario, any partner with ratio and bonus, taxes, extra cash costs, and net value after opportunity cost.
- **Transfer bonus tracker and calculator:** standard vs effective ratio, start/end dates, eligibility, targeted flag, source, reported and verified dates, and computed status (Verified active / Needs verification / Expired / Upcoming). Integer math handles non-1:1 ratios, bonus %, flooring and 1,000-point increments, and shows the savings from a bonus.
- **Flexible dates:** every valid date pair for the month or weekends, a calendar color-coded by your recorded prices, prefilled Google Flights/Kayak links per airport, and the best combination including ground costs.
- **Award search links:** prefilled where the site supports it. Opening a link never implies availability.

### Trip planning

- **Trips:** create one from a destination (with estimated budget lines) or a blank city (Nominatim lookup). Edit dates, travelers, budget, day hours and travel mode. Export a single trip.
- **Map & places:** OpenStreetMap search near the trip, paste a **Google Maps link** (coordinates and name are parsed locally; short links get an honest fallback), or add a place manually by clicking the map. Places can be categorized, favorited, marked visited, and given notes, a reference URL, visit length and hours (auto-filled from OSM when simple). **Duplicate detection** checks the OSM id, a similar name within 75 m, or the same spot.
- **Daily itinerary:** day tabs, numbered map markers, drag-and-drop (mouse, touch and keyboard), and locked fixed-time reservations. Meals get soft lunch/dinner windows and opening hours are enforced. **Optimize my day** uses cheapest insertion plus relocate and 2-opt moves on a real OSRM duration matrix. **View route** draws the route with real leg times. If routing fails, stops are ordered by straight-line distance and **no travel times are shown**. Google Maps (incl. transit) and OSM directions links are always available.
- **Budget:** estimated vs actual by category, points used and remaining, total cash, remaining budget, daily allowance, and multi-currency expenses (stored with the rate and date used).

### App

Responsive PWA (installable, offline app shell, previously viewed map tiles cached), light/dark mode, accessible controls (labels, focus rings, keyboard drag-and-drop, skip link, reduced motion), and loading, error and empty states.

---

## 3. Run it locally

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 95 unit tests (transfer math, ranking, optimizer, storage, parsers…)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build (service worker active)
```

No environment variables are required. The optional Nominatim contact email is set in **Settings** and sent only with place searches.

## 4. Deploy for free

The build in `dist/` is static and uses relative paths, so it works at a domain root or a sub-path.

**GitHub Pages (workflow included):**

1. Create a GitHub repository and push this folder to `main`.
2. In the repo, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The included `.github/workflows/deploy.yml` tests, builds and publishes to `https://<user>.github.io/<repo>/`.

**Cloudflare Pages (alternative):** create a Pages project from the repo with build command `npm run build` and output directory `dist`. It's served at `https://<project>.pages.dev`. The free plan needs no card.

> Deployment is **not** done for you: it needs your GitHub or Cloudflare account. Nothing has been published.

---

## 5. Acceptance walkthrough

1. Open the app. 2–6. The defaults are already **100,000 points, SAN + LAX (LAX with a $90 ground cost), April, 5–8 days, $1,000**. Press **Find trips for my points**.
7. Explore shows ranked destinations, category picks, explanations and labeled estimates. Open a destination for the strategy table, cost breakdown and prefilled research links.
8. **Record a real flight quote** opens a comparison prefilled with airports and dates. Add cash and award options to compare.
9. **Transfer Bonuses** shows seeded bonuses as *Needs verification* with sources and dates. Toggle **Show expired** to see expired ones.
10. Use the transfer bonus calculator (e.g. 26,000 Avios with a 30% bonus → 20,000 Chase points), or the redemption calculator in Flights & Points.
11. **Save as a new trip** from the destination.
12–13. In **Map & Itinerary**, search places (e.g. "Iolani Palace"), save them and see them on the map.
14–15. Add places to Day 1 and press **Optimize my day**.
16. Reload the page: trips, places and the optimized order persist.
17. Use **Export** on a trip, or **Settings → Export everything**.

Edge cases covered by tests or the UI: insufficient points, missing cash price, expired bonuses, non-1:1 ratios, bonus rounding and increments, unavailable award space, duplicate places, bad or missing addresses ("no results" guidance and manual entry), missing routes (honest fallback), offline (banner, cached data, service worker), persistence (IndexedDB round-trip tests), and free-tier failures (rate-limit detection, stale cache, retry).

---

## 6. Status: what's implemented, what depends on providers, what's not done

**Implemented and working:** everything in §2.

**Depends on free third-party services (works when they respond):** weather history, place search, routing/optimization times, FX rates, photos. Each has a cached or manual fallback.

**Not possible for free (manual by design):** live cash fares, live award availability, automatic Chase bonus detection, live travel advisories.

**Not built (Phase 3, intentionally deferred):** saved-search alerts, calendar (.ics) export, other card programs (Amex/Capital One/Citi), cloud sync, AI suggestions.

**Data freshness:** Chase card rules, partners, ratios and bonuses were compiled on **2026-11-18** from public sources (linked in-app). Destination costs and advisory levels are developer estimates. Verify anything you act on.

## 7. Project layout

```
src/
  data/        cards, partners + bonus seeds, destinations, airports
  engine/      transfer math, redemption/cpp, estimates, ranking, flexible dates,
               route optimizer, schedule, budget  (pure, unit-tested)
  providers/   http (timeouts, rate limits), geocode, routing, weather, wiki, fx
  lib/         types, IndexedDB (Dexie) + export/import, hooks, links, Maps-link parser
  components/  UI kit, search form, destination views, comparison editor, calculators, map, planner
  pages/       Dashboard, Explore, Flights & Points, Bonuses, Trips, Map & Itinerary, Budget, Settings
tests/         Vitest suites
```

PointPilot is an independent personal tool and is not affiliated with JPMorgan Chase or any airline or hotel program. Map data © OpenStreetMap contributors.
