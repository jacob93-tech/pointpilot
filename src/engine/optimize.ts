/**
 * Day-route optimizer: an open-source-style heuristic for a small TSP with time windows.
 *  - Locked stops keep their fixed start time (hard constraint) and their relative order.
 *  - Free stops are placed by cheapest insertion, then improved with relocate moves and
 *    2-opt reversals over runs of free stops.
 *  - Opening hours are hard constraints; meal windows are soft (penalties).
 * Travel durations come from a routing matrix (seconds). If the matrix is unavailable the
 * caller passes a proxy (straight-line based) that is used ONLY for ordering; the result is
 * flagged so the UI never presents proxy values as real travel times.
 */

export interface OptStop {
  id: string;
  durationMin: number;
  locked: boolean;
  fixedStartMin?: number;
  openMin?: number;
  closeMin?: number;
  meal?: 'lunch' | 'dinner' | null;
}

export interface OptInput {
  stops: OptStop[];
  dayStartMin: number;
  dayEndMin: number;
  /** matrix over [start?, ...stops] — index 0 is the start point if hasStart */
  matrixSec: number[][];
  hasStart: boolean;
  travelTimesKnown: boolean;
}

export interface ScheduledStop {
  id: string;
  arriveMin: number;
  startMin: number;
  endMin: number;
  travelMin: number | null;
  waitMin: number;
  issues: string[];
}

export interface OptResult {
  order: string[];
  schedule: ScheduledStop[];
  cost: number;
  totalTravelMin: number | null;
  feasible: boolean;
  issues: string[];
}

const LUNCH: [number, number] = [11 * 60 + 30, 14 * 60];
const DINNER: [number, number] = [17 * 60 + 30, 21 * 60];

export function hhmmToMin(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return undefined;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 24 || mm > 59) return undefined;
  return h * 60 + mm;
}

export function minToHHMM(n: number): string {
  const v = Math.max(0, Math.round(n));
  return `${String(Math.floor(v / 60) % 24).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

/** Simulate a visiting order. Returns schedule and a cost (lower is better). */
export function simulate(orderIdx: number[], input: OptInput): { schedule: ScheduledStop[]; cost: number; hardViolations: number; travelSec: number } {
  const off = input.hasStart ? 1 : 0;
  let t = input.dayStartMin;
  let prev: number | null = input.hasStart ? 0 : null;
  let cost = 0;
  let hard = 0;
  let travelSec = 0;
  const schedule: ScheduledStop[] = [];
  for (const i of orderIdx) {
    const s = input.stops[i];
    const issues: string[] = [];
    const leg = prev == null ? 0 : input.matrixSec[prev]?.[i + off] ?? 0;
    travelSec += leg;
    const travelMin = input.travelTimesKnown ? leg / 60 : 0;
    const arrive = t + travelMin;
    let start = arrive;
    if (s.locked && s.fixedStartMin != null) {
      if (arrive > s.fixedStartMin + 5) {
        hard++;
        issues.push(`Arrives ~${Math.round(arrive - s.fixedStartMin)} min after the fixed ${minToHHMM(s.fixedStartMin)} start`);
      }
      start = s.fixedStartMin;
    } else if (s.openMin != null && start < s.openMin) start = s.openMin;
    if (s.closeMin != null && start + s.durationMin > s.closeMin) {
      hard++;
      issues.push(`Would run past closing time (${minToHHMM(s.closeMin)})`);
    }
    if (s.meal) {
      const [a, b] = s.meal === 'lunch' ? LUNCH : DINNER;
      if (start < a) cost += (a - start) * 0.5;
      if (start > b) cost += (start - b) * 0.5;
    }
    const wait = Math.max(0, start - arrive);
    const end = start + s.durationMin;
    cost += leg / 60 + wait * 0.2;
    schedule.push({ id: s.id, arriveMin: arrive, startMin: start, endMin: end, travelMin: prev == null ? null : input.travelTimesKnown ? travelMin : null, waitMin: wait, issues });
    t = end;
    prev = i + off;
  }
  if (t > input.dayEndMin) {
    cost += (t - input.dayEndMin) * 3;
    if (schedule.length) schedule[schedule.length - 1].issues.push(`Day runs ~${Math.round(t - input.dayEndMin)} min past your ${minToHHMM(input.dayEndMin)} end time`);
  }
  cost += hard * 10000;
  return { schedule, cost, hardViolations: hard, travelSec };
}

export function optimizeDay(input: OptInput): OptResult {
  const n = input.stops.length;
  if (n === 0) return { order: [], schedule: [], cost: 0, totalTravelMin: input.travelTimesKnown ? 0 : null, feasible: true, issues: [] };

  const locked = input.stops
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.locked && s.fixedStartMin != null)
    .sort((a, b) => a.s.fixedStartMin! - b.s.fixedStartMin!)
    .map(({ i }) => i);
  const free = input.stops.map((_, i) => i).filter((i) => !locked.includes(i));

  // Insert free stops (longest-duration first gives a more stable result), cheapest position each time.
  let order = [...locked];
  const seeds = [...free].sort((a, b) => input.stops[b].durationMin - input.stops[a].durationMin);
  for (const f of seeds) order = bestInsertion(order, f, input);

  // Improvement: relocate + 2-opt over free runs, until no gain.
  let cur = simulate(order, input).cost;
  for (let iter = 0; iter < 60; iter++) {
    let improved = false;
    for (const f of free) {
      const without = order.filter((x) => x !== f);
      const cand = bestInsertion(without, f, input);
      const c = simulate(cand, input).cost;
      if (c < cur - 1e-6) { order = cand; cur = c; improved = true; }
    }
    for (let a = 0; a < order.length - 1; a++) {
      for (let b = a + 1; b < order.length; b++) {
        const seg = order.slice(a, b + 1);
        if (seg.some((x) => locked.includes(x))) continue;
        const cand = [...order.slice(0, a), ...seg.reverse(), ...order.slice(b + 1)];
        const c = simulate(cand, input).cost;
        if (c < cur - 1e-6) { order = cand; cur = c; improved = true; }
      }
    }
    if (!improved) break;
  }

  const sim = simulate(order, input);
  const issues = sim.schedule.flatMap((s) => s.issues);
  return {
    order: order.map((i) => input.stops[i].id),
    schedule: sim.schedule,
    cost: sim.cost,
    totalTravelMin: input.travelTimesKnown ? Math.round(sim.travelSec / 60) : null,
    feasible: sim.hardViolations === 0,
    issues,
  };
}

function bestInsertion(order: number[], f: number, input: OptInput): number[] {
  let best: number[] | null = null;
  let bestCost = Infinity;
  for (let pos = 0; pos <= order.length; pos++) {
    const cand = [...order.slice(0, pos), f, ...order.slice(pos)];
    const c = simulate(cand, input).cost;
    if (c < bestCost) { bestCost = c; best = cand; }
  }
  return best!;
}

/** Straight-line proxy matrix (seconds at an assumed speed). For ORDERING ONLY — never displayed as travel time. */
export function proxyMatrix(points: { lat: number; lon: number }[], metersPerSec = 1.3): number[][] {
  const R = 6371008.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  return points.map((a) =>
    points.map((b) => {
      const dLat = rad(b.lat - a.lat);
      const dLon = rad(b.lon - a.lon);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
      return (2 * R * Math.asin(Math.sqrt(h))) / metersPerSec;
    }),
  );
}
