import { describe, expect, it } from 'vitest';
import { candidateDates, programOptions, type TransferContext } from '../src/engine/playbook';
import { estimateTrip } from '../src/engine/ranking';
import { SEED_BONUSES, SEED_PARTNERS } from '../src/data/partners';
import { getDestination } from '../src/data/destinations';
import { defaultProfile, defaultSearch } from '../src/lib/db';
import { mid } from '../src/engine/estimates';
import type { SearchParams } from '../src/lib/types';

const params = (over: Partial<SearchParams> = {}): SearchParams => ({ ...defaultSearch(defaultProfile()), month: 4, year: 2027, ...over });
const today = '2026-11-18';
const unverified: TransferContext = { partners: SEED_PARTNERS, bonuses: SEED_BONUSES, today, verifyWindowDays: 7 };
const verifiedBA: TransferContext = {
  ...unverified,
  bonuses: SEED_BONUSES.map((b) => (b.partnerId === 'british-airways' ? { ...b, verifiedAt: today } : b)),
};
const mexico = getDestination('mexico-city')!;

describe('program options', () => {
  it('applies only VERIFIED bonuses to the Chase points needed', () => {
    const plain = programOptions(mexico, 1500, 'economy', 1, [300, 600], 'csp', unverified).find((o) => o.partner.id === 'british-airways')!;
    const bonus = programOptions(mexico, 1500, 'economy', 1, [300, 600], 'csp', verifiedBA).find((o) => o.partner.id === 'british-airways')!;
    expect(plain.verifiedBonus).toBeNull();
    expect(plain.reportedBonus?.bonusPercent).toBe(30);
    expect(plain.chasePoints).toEqual(plain.chasePointsNoBonus);
    expect(plain.chasePointsIfReported![0]).toBeLessThan(plain.chasePoints[0]);
    expect(bonus.verifiedBonus?.bonusPercent).toBe(30);
    expect(bonus.chasePoints[1]).toBeLessThan(bonus.chasePointsNoBonus[1]);
    // 30% bonus: need roughly 1/1.3 of the points, rounded up to 1,000-point steps
    expect(bonus.chasePoints[1]).toBe(Math.ceil(bonus.partnerPoints[1] / 1.3 / 1000) * 1000);
  });

  it('puts the bonused program first', () => {
    expect(programOptions(mexico, 1500, 'economy', 1, [300, 600], 'csp', verifiedBA)[0].partner.id).toBe('british-airways');
  });

  it('only lists region-appropriate programs (no Aer Lingus to Mexico; Southwest yes)', () => {
    const ids = programOptions(mexico, 1500, 'economy', 1, [300, 600], 'csp', unverified).map((o) => o.partner.id);
    expect(ids).not.toContain('aer-lingus');
    expect(ids).toContain('southwest');
  });

  it('non-transfer cards get no partner options', () => {
    expect(programOptions(mexico, 1500, 'economy', 1, [300, 600], 'cfu', unverified)).toEqual([]);
  });
});

describe('ranking with transfer bonuses', () => {
  const ctx = { minAcceptableCpp: 1.25, weather: {}, quotes: {} };
  it('without a verified bonus: no program named, unverified bonus shown only as a hint', () => {
    const t = estimateTrip(mexico, params(), { ...ctx, transfer: unverified })!;
    expect(t.flight.awardProgram).toBeNull();
    expect(t.flight.reportedBonus?.bonusPercent).toBe(30);
    for (const s of t.strategies) expect(s.pointsRangeNoBonus).toEqual(s.pointsRange);
  });
  it('with a verified BA bonus: award flights get cheaper and the no-bonus price is kept', () => {
    const plain = estimateTrip(mexico, params(), { ...ctx, transfer: unverified })!;
    const t = estimateTrip(mexico, params(), { ...ctx, transfer: verifiedBA })!;
    expect(t.flight.awardProgram?.partnerId).toBe('british-airways');
    expect(mid(t.flight.awardPoints!)).toBeLessThan(mid(plain.flight.awardPoints!));
    const pf = t.strategies.find((s) => s.id === 'points-flight')!;
    if (pf.flightMethod === 'award') expect(mid(pf.pointsRange)).toBeLessThan(mid(pf.pointsRangeNoBonus));
    expect(t.flight.reportedBonus).toBeNull();
  });
});

describe('candidate dates', () => {
  it('gives up to three distinct date pairs in the month, return = depart + days − 1', () => {
    const c = candidateDates(params(), 6);
    expect(c.length).toBeGreaterThanOrEqual(2);
    expect(new Set(c.map((x) => x.depart)).size).toBe(c.length);
    for (const x of c) {
      expect(x.depart.startsWith('2027-04')).toBe(true);
      expect((Date.parse(x.ret) - Date.parse(x.depart)) / 86400000).toBe(5);
    }
  });
  it('specific dates are used as-is', () => {
    const c = candidateDates(params({ dateMode: 'specific', departDates: ['2027-04-09'], returnDates: ['2027-04-15'] }), 6);
    expect(c).toEqual([{ depart: '2027-04-09', ret: '2027-04-15', label: 'Your dates' }]);
  });
});
