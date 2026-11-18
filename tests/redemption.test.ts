import { describe, expect, it } from 'vitest';
import { centsPerPoint, evaluateOption, judge, summarizeComparison } from '../src/engine/redemption';
import { SEED_PARTNERS } from '../src/data/partners';
import type { Comparison, TransferBonus } from '../src/lib/types';

const ctx = { cardId: 'csp' as const, balance: 100000, minAcceptableCpp: 1.25, partners: SEED_PARTNERS, bonuses: [] as TransferBonus[], today: '2026-11-18' };

describe('centsPerPoint', () => {
  it('subtracts award taxes once (cash price already includes taxes)', () => {
    // $600 ticket vs 30,000 pts + $11.20 → (600 − 11.20) / 30,000 = 1.9627¢
    expect(centsPerPoint(600, 11.2, 30000)).toBeCloseTo(1.9627, 3);
  });
  it('subtracts additional cash costs', () => expect(centsPerPoint(600, 11.2, 30000, 88.8)).toBeCloseTo(1.6667, 3));
  it('returns null with no points', () => expect(centsPerPoint(600, 0, 0)).toBeNull());
  it('can go negative when fees exceed the cash price', () => expect(centsPerPoint(300, 400, 20000)!).toBeLessThan(0));
});

describe('judge', () => {
  it('below the card floor is poor', () => expect(judge(0.8, 1.0, 1.25).verdict).toBe('poor'));
  it('between floor and target is weak', () => expect(judge(1.1, 1.0, 1.25).verdict).toBe('weak'));
  it('meets target', () => expect(judge(1.5, 1.0, 1.25).verdict).toBe('good'));
  it('well above target', () => expect(judge(2.5, 1.0, 1.25).verdict).toBe('excellent'));
  it('unknown', () => expect(judge(null, 1, 1.25).verdict).toBe('unknown'));
});

const cmp = (over: Partial<Comparison> = {}): Comparison => ({
  id: 'c', title: 'SAN–HNL', kind: 'flight', travelers: 1, cashPrice: 600, cashSource: 'Google Flights', options: [], createdAt: '', updatedAt: '', ...over,
});

describe('evaluateOption', () => {
  it('applies only VERIFIED bonuses to the math; shows reported ones as a scenario', () => {
    const reported: TransferBonus = { id: 'r', partnerId: 'british-airways', bonusPercent: 30, endDate: '2026-12-01', eligibility: '', targeted: false, sourceName: '', sourceUrl: '', reportedAt: '2026-11-18', createdBy: 'seed' };
    const e = evaluateOption(cmp(), { id: 'o', method: 'transfer', partnerId: 'british-airways', partnerPoints: 26000, taxesFees: 11.2, availability: 'seen-available', source: '' }, { ...ctx, bonuses: [reported] });
    expect(e.chasePoints).toBe(26000);
    expect(e.planIfReportedBonus?.chasePoints).toBe(20000); // 20,000 × 1.3 = 26,000
    const verified = { ...reported, verifiedAt: '2026-11-18' };
    const e2 = evaluateOption(cmp(), { id: 'o', method: 'transfer', partnerId: 'british-airways', partnerPoints: 26000, taxesFees: 11.2, availability: 'seen-available', source: '' }, { ...ctx, bonuses: [verified] });
    expect(e2.chasePoints).toBe(20000);
  });
  it('warns when availability is not confirmed', () => {
    const e = evaluateOption(cmp(), { id: 'o', method: 'transfer', partnerId: 'united', partnerPoints: 25000, taxesFees: 11.2, availability: 'not-checked', source: '' }, ctx);
    expect(e.warnings.join(' ')).toMatch(/irreversible/);
  });
  it('flags insufficient points', () => {
    const e = evaluateOption(cmp(), { id: 'o', method: 'transfer', partnerId: 'united', partnerPoints: 150000, taxesFees: 11.2, availability: 'seen-available', source: '' }, ctx);
    expect(e.warnings.join(' ')).toMatch(/you have 100,000/);
    expect(e.remainingPoints).toBe(-50000);
  });
  it('non-transfer cards cannot use partners', () => {
    const e = evaluateOption(cmp(), { id: 'o', method: 'transfer', partnerId: 'united', partnerPoints: 25000, taxesFees: 11.2, availability: 'seen-available', source: '' }, { ...ctx, cardId: 'cfu' });
    expect(e.eligible).toBe(false);
  });
  it('Hyatt uses 4:3 on Sapphire Preferred', () => {
    const e = evaluateOption(cmp({ kind: 'hotel', cashPrice: 400 }), { id: 'o', method: 'transfer', partnerId: 'world-of-hyatt', partnerPoints: 15000, taxesFees: 0, availability: 'seen-available', source: '' }, ctx);
    expect(e.chasePoints).toBe(20000);
    expect(e.cpp).toBeCloseTo(2.0);
  });
});

describe('summarizeComparison', () => {
  it('recommends paying cash when no option clears the minimum', () => {
    const s = summarizeComparison(cmp({ cashPrice: 250, options: [{ id: 'a', method: 'transfer', partnerId: 'united', partnerPoints: 25000, taxesFees: 11.2, availability: 'seen-available', source: '' }] }), ctx);
    expect(s.payCash).toBe(true);
  });
  it('recommends the highest-cpp usable option', () => {
    const s = summarizeComparison(
      cmp({
        options: [
          { id: 'a', method: 'transfer', partnerId: 'united', partnerPoints: 40000, taxesFees: 11.2, availability: 'seen-available', source: '' },
          { id: 'b', method: 'transfer', partnerId: 'british-airways', partnerPoints: 26000, taxesFees: 11.2, availability: 'seen-available', source: '' },
          { id: 'c', method: 'chase-travel', chaseTravelPoints: 60000, taxesFees: 0, availability: 'seen-available', source: '' },
        ],
      }),
      ctx,
    );
    expect(s.best?.option.id).toBe('b');
    expect(s.payCash).toBe(false);
  });
  it('ignores unavailable award inventory', () => {
    const s = summarizeComparison(cmp({ options: [{ id: 'a', method: 'transfer', partnerId: 'united', partnerPoints: 20000, taxesFees: 11.2, availability: 'unavailable', source: '' }] }), ctx);
    expect(s.best).toBeNull();
    expect(s.payCash).toBe(true);
  });
  it('missing cash price → asks for data instead of guessing', () => {
    const s = summarizeComparison(cmp({ cashPrice: null, options: [{ id: 'a', method: 'transfer', partnerId: 'united', partnerPoints: 20000, taxesFees: 11.2, availability: 'seen-available', source: '' }] }), ctx);
    expect(s.best).toBeNull();
    expect(s.recommendation).toMatch(/Record the cash price/);
  });
});
