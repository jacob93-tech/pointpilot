import { describe, expect, it } from 'vitest';
import { generateDatePairs, netFlightCost } from '../src/engine/flexDates';
import { hhmmToMin, optimizeDay, proxyMatrix, simulate } from '../src/engine/optimize';
import { summarizeBudget } from '../src/engine/budget';
import { parseGoogleMapsLink, sanitizeUrl } from '../src/lib/gmaps';
import { simpleHours } from '../src/providers/geocode';
import { summarizeArchive, lastCompletedYears } from '../src/providers/weather';
import type { Expense, Trip } from '../src/lib/types';

describe('flexible dates', () => {
  const base = { year: 2027, month: 4, departDates: [], returnDates: [], minDays: 5, maxDays: 8 };
  it('month mode generates every valid pair', () => {
    const pairs = generateDatePairs({ ...base, dateMode: 'month' });
    expect(pairs.length).toBe(30 * 4);
    expect(pairs.every((p) => p.days >= 5 && p.days <= 8)).toBe(true);
    expect(pairs[0]).toEqual({ depart: '2027-04-01', ret: '2027-04-05', days: 5, nights: 4 });
  });
  it('specific dates filter by duration', () => {
    const pairs = generateDatePairs({ ...base, dateMode: 'specific', departDates: ['2027-04-09', '2027-04-10'], returnDates: ['2027-04-14', '2027-04-20'] });
    expect(pairs.map((p) => `${p.depart}>${p.ret}`)).toEqual(['2027-04-09>2027-04-14', '2027-04-10>2027-04-14']);
  });
  it('range mode keeps returns inside the window', () => {
    const pairs = generateDatePairs({ ...base, dateMode: 'range', rangeStart: '2027-04-10', rangeEnd: '2027-04-17' });
    expect(pairs.every((p) => p.ret <= '2027-04-17')).toBe(true);
    expect(pairs.length).toBeGreaterThan(0);
  });
  it('weekend mode departs Thu–Sat and returns Sun/Mon', () => {
    const pairs = generateDatePairs({ ...base, dateMode: 'weekends', minDays: 2, maxDays: 4 });
    for (const p of pairs) {
      expect([4, 5, 6]).toContain(new Date(p.depart + 'T00:00:00Z').getUTCDay());
      expect([0, 1]).toContain(new Date(p.ret + 'T00:00:00Z').getUTCDay());
    }
  });
  it('skips past dates', () => {
    expect(generateDatePairs({ ...base, dateMode: 'month' }, '2027-04-20').every((p) => p.depart >= '2027-04-20')).toBe(true);
  });
  it('alternate airport ground cost is part of net price', () => {
    // LAX $350 + $90 ground vs SAN $420 → SAN cheaper for 1 traveler
    expect(netFlightCost(350, 1, 90)).toBeGreaterThan(netFlightCost(420, 1, 0));
  });
});

describe('route optimizer', () => {
  // four points on a line: A(0) B(1) C(2) D(3) km apart — visiting in a scrambled order is wasteful
  const pts = [0, 3, 1, 2].map((k) => ({ lat: 35.0, lon: 139.0 + k * 0.011 }));
  const stops = pts.map((_, i) => ({ id: `s${i}`, durationMin: 30, locked: false }));
  const m = proxyMatrix(pts);

  it('finds the straight-line order', () => {
    const r = optimizeDay({ stops, dayStartMin: 540, dayEndMin: 1260, matrixSec: m, hasStart: false, travelTimesKnown: true });
    const order = r.order.join(',');
    expect(['s0,s2,s3,s1', 's1,s3,s2,s0']).toContain(order);
    const naive = simulate([0, 1, 2, 3], { stops, dayStartMin: 540, dayEndMin: 1260, matrixSec: m, hasStart: false, travelTimesKnown: true }).cost;
    expect(r.cost).toBeLessThan(naive);
  });
  it('keeps locked stops at their fixed time', () => {
    const locked = stops.map((s, i) => (i === 1 ? { ...s, locked: true, fixedStartMin: 600 } : s));
    const r = optimizeDay({ stops: locked, dayStartMin: 540, dayEndMin: 1260, matrixSec: m, hasStart: false, travelTimesKnown: true });
    const s1 = r.schedule.find((x) => x.id === 's1')!;
    expect(s1.startMin).toBe(600);
  });
  it('reports a violated opening hour instead of hiding it', () => {
    const closed = stops.map((s, i) => (i === 0 ? { ...s, openMin: 540, closeMin: 545 } : s));
    const r = optimizeDay({ stops: closed, dayStartMin: 540, dayEndMin: 1260, matrixSec: m, hasStart: false, travelTimesKnown: true });
    expect(r.feasible).toBe(false);
    expect(r.issues.join(' ')).toMatch(/closing/);
  });
  it('without real travel times the schedule reports no travel minutes', () => {
    const r = optimizeDay({ stops, dayStartMin: 540, dayEndMin: 1260, matrixSec: m, hasStart: false, travelTimesKnown: false });
    expect(r.totalTravelMin).toBeNull();
    expect(r.schedule.every((s) => s.travelMin === null)).toBe(true);
  });
  it('empty day', () => expect(optimizeDay({ stops: [], dayStartMin: 0, dayEndMin: 10, matrixSec: [], hasStart: false, travelTimesKnown: true }).order).toEqual([]));
  it('hh:mm parsing', () => {
    expect(hhmmToMin('09:30')).toBe(570);
    expect(hhmmToMin('nope')).toBeUndefined();
  });
});

describe('budget', () => {
  const trip: Trip = {
    id: 't', name: 'Tokyo', city: 'Tokyo', lat: 0, lon: 0, startDate: '2027-04-10', endDate: '2027-04-16', travelers: 1, cashBudget: 1000, pointsBudget: 80000,
    currency: 'USD', notes: '', dayStart: '09:00', dayEnd: '21:00', travelMode: 'foot', createdAt: '', updatedAt: '',
  };
  const ex = (o: Partial<Expense>): Expense => ({ id: Math.random().toString(), tripId: 't', category: 'food', description: '', kind: 'actual', amount: 0, currency: 'USD', amountHome: 0, pointsUsed: 0, date: '2027-04-10', createdAt: '', ...o });
  it('totals, remaining budget, points and daily allowance', () => {
    const s = summarizeBudget(trip, [ex({ category: 'flights', amountHome: 22.4, pointsUsed: 70000 }), ex({ amountHome: 100 }), ex({ kind: 'estimated', category: 'hotels', amountHome: 900 })], 100000, '2027-04-12');
    expect(s.actualTotal).toBeCloseTo(122.4);
    expect(s.estimatedTotal).toBe(900);
    expect(s.pointsUsed).toBe(70000);
    expect(s.remainingPoints).toBe(30000);
    expect(s.remainingBudget).toBeCloseTo(877.6);
    expect(s.daysLeft).toBe(5);
    expect(s.dailyAllowance).toBeCloseTo(175.52);
  });
  it('before the trip all days remain', () => expect(summarizeBudget(trip, [], 0, '2027-01-01').daysLeft).toBe(7));
  it('over budget flag', () => expect(summarizeBudget(trip, [ex({ amountHome: 1500 })], 0, '2027-04-11').overBudget).toBe(true));
});

describe('Google Maps link parsing', () => {
  it('reads precise !3d!4d coordinates and the place name', () => {
    const r = parseGoogleMapsLink('https://www.google.com/maps/place/Senso-ji/@35.7147651,139.7966553,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d35.7147651!4d139.7966553');
    expect(r.ok).toBe(true);
    expect(r.lat).toBeCloseTo(35.7147651);
    expect(r.lon).toBeCloseTo(139.7966553);
    expect(r.name).toBe('Senso-ji');
  });
  it('reads ?q=lat,lon', () => {
    const r = parseGoogleMapsLink('https://maps.google.com/?q=21.2766,-157.8274');
    expect(r.lat).toBeCloseTo(21.2766);
  });
  it('reads a search query name only', () => {
    const r = parseGoogleMapsLink('https://www.google.com/maps/search/?api=1&query=Ichiran+Shibuya');
    expect(r.ok).toBe(true);
    expect(r.name).toBe('Ichiran Shibuya');
    expect(r.lat).toBeUndefined();
  });
  it('explains short links can’t be resolved', () => {
    const r = parseGoogleMapsLink('https://maps.app.goo.gl/abc123');
    expect(r.ok).toBe(false);
    expect(r.shortLink).toBe(true);
  });
  it('rejects non-URLs and other sites', () => {
    expect(parseGoogleMapsLink('not a url').ok).toBe(false);
    expect(parseGoogleMapsLink('https://evil.example.com/@1,2').ok).toBe(false);
  });
  it('sanitizes reference URLs', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeUndefined();
    expect(sanitizeUrl('https://example.com/a')).toBe('https://example.com/a');
  });
});

describe('providers (pure parts)', () => {
  it('simple opening hours', () => {
    expect(simpleHours('Mo-Su 10:00-22:00')).toEqual({ open: '10:00', close: '22:00' });
    expect(simpleHours('Mo-Fr 09:00-17:00; Sa 10:00-14:00')).toBeNull();
  });
  it('weather archive summary uses only the requested month', () => {
    const res = { daily: { time: ['2025-03-31', '2025-04-01', '2025-04-02'], temperature_2m_max: [10, 20, 22], temperature_2m_min: [5, 10, 12], precipitation_sum: [0, 5, 0] } };
    const s = summarizeArchive(res, 4, [2025])!;
    expect(s.avgHighC).toBe(21);
    expect(s.rainyDayPct).toBe(50);
  });
  it('last completed years excludes the current incomplete month', () => {
    expect(lastCompletedYears(4, new Date('2026-11-18'))).toEqual([2024, 2025, 2026]);
    expect(lastCompletedYears(12, new Date('2026-11-18'))).toEqual([2023, 2024, 2025]);
  });
});

import { findDuplicate } from '../src/lib/places';
import { scheduleItems } from '../src/engine/schedule';
import type { Place } from '../src/lib/types';

describe('duplicate saved places', () => {
  const base: Place = { id: 'a', tripId: 't', name: 'Iolani Palace', category: 'attraction', lat: 21.3069, lon: -157.8588, address: '', source: 'nominatim', osmRef: 'way/123', notes: '', favorite: false, visited: false, durationMin: 60, createdAt: '' };
  it('same OSM reference is a duplicate', () => expect(findDuplicate([base], { name: 'Anything', lat: 0, lon: 0, osmRef: 'way/123' })).toBe(base));
  it('same name nearby (accents/case ignored) is a duplicate', () => expect(findDuplicate([base], { name: 'ʻIolani palace', lat: 21.3071, lon: -157.8589 })).toBeDefined());
  it('same name far away is NOT a duplicate (chains)', () => expect(findDuplicate([base], { name: 'Iolani Palace', lat: 21.4, lon: -157.9 })).toBeUndefined());
  it('different place next door is NOT a duplicate', () => expect(findDuplicate([base], { name: 'State Capitol', lat: 21.3072, lon: -157.8586 })).toBeUndefined());
});

describe('day schedule', () => {
  it('honors fixed times and flags conflicts and closing hours', () => {
    const s = scheduleItems(
      [
        { id: 'a', durationMin: 120, locked: false, travelMin: null },
        { id: 'b', durationMin: 60, locked: true, fixedStartMin: 600, travelMin: 15 },
        { id: 'c', durationMin: 90, locked: false, closeMin: 690, travelMin: 10 },
      ],
      540,
      1260,
    );
    expect(s[0]).toMatchObject({ startMin: 540, endMin: 660 });
    expect(s[1].startMin).toBe(600);
    expect(s[1].issues.join()).toMatch(/fixed/);
    expect(s[2].issues.join()).toMatch(/Closes/);
  });
});
