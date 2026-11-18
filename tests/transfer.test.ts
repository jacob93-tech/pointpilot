import { describe, expect, it } from 'vitest';
import { bestBonusFor, bonusState, chaseNeeded, effectiveRatio, formatRatio, partnerReceived, planTransfer, ratioFor } from '../src/engine/transfer';
import { SEED_PARTNERS } from '../src/data/partners';
import type { TransferBonus } from '../src/lib/types';

const ONE = { chase: 1, partner: 1 };
const HYATT_4_3 = { chase: 4, partner: 3 };

describe('partnerReceived', () => {
  it('1:1 with no bonus', () => expect(partnerReceived(10000, ONE)).toBe(10000));
  it('1:1 with 30% bonus', () => expect(partnerReceived(1000, ONE, 30)).toBe(1300));
  it('4:3 ratio (Hyatt on Sapphire Preferred)', () => expect(partnerReceived(1000, HYATT_4_3)).toBe(750));
  it('4:3 ratio with a 25% bonus', () => expect(partnerReceived(4000, HYATT_4_3, 25)).toBe(3750));
  it('floors fractional results', () => expect(partnerReceived(1000, { chase: 3, partner: 2 })).toBe(666));
  it('handles fractional bonus percentages', () => expect(partnerReceived(1000, ONE, 12.5)).toBe(1125));
});

describe('chaseNeeded — increments and rounding', () => {
  it('rounds up to the 1,000-point increment', () => expect(chaseNeeded(22500, ONE)).toBe(23000));
  it('respects the minimum transfer', () => expect(chaseNeeded(200, ONE)).toBe(1000));
  it('exact multiples stay exact', () => expect(chaseNeeded(60000, ONE)).toBe(60000));
  it('30% bonus: 60,000 miles needs 47,000 (47,000×1.3 = 61,100)', () => {
    expect(chaseNeeded(60000, ONE, 30)).toBe(47000);
    expect(partnerReceived(46000, ONE, 30)).toBeLessThan(60000); // 59,800 — one increment less is not enough
  });
  it('80% bonus on IHG: 50,000 points needs 28,000 Chase', () => {
    // 28,000 × 1.8 = 50,400 ≥ 50,000; 27,000 × 1.8 = 48,600 < 50,000
    expect(chaseNeeded(50000, ONE, 80)).toBe(28000);
  });
  it('non-1:1 base ratio: 15,000 Hyatt at 4:3 needs 20,000 Chase', () => expect(chaseNeeded(15000, HYATT_4_3)).toBe(20000));
  it('non-1:1 ratio + rounding: 12,000 Hyatt at 4:3 → 16,000', () => expect(chaseNeeded(12000, HYATT_4_3)).toBe(16000));
  it('non-1:1 ratio rounds up when not divisible: 17,000 Hyatt at 4:3 → 23,000', () => {
    // 22,000 → 16,500 (short); 23,000 → 17,250 (enough)
    expect(chaseNeeded(17000, HYATT_4_3)).toBe(23000);
  });
  it('bonus + non-1:1 ratio', () => expect(chaseNeeded(30000, HYATT_4_3, 25)).toBe(32000));
  it('zero / negative needs nothing', () => {
    expect(chaseNeeded(0, ONE)).toBe(0);
    expect(chaseNeeded(-5, ONE)).toBe(0);
  });
  it('rejects invalid ratios', () => expect(() => chaseNeeded(1000, { chase: 0, partner: 1 })).toThrow());
});

describe('planTransfer', () => {
  it('reports savings from a bonus and leftover miles', () => {
    const p = planTransfer(60000, ONE, 30);
    expect(p.chasePoints).toBe(47000);
    expect(p.partnerPoints).toBe(61100);
    expect(p.leftover).toBe(1100);
    expect(p.chasePointsWithoutBonus).toBe(60000);
    expect(p.savedByBonus).toBe(13000);
  });
  it('effective ratio', () => {
    expect(effectiveRatio(ONE, 30)).toBeCloseTo(1.3);
    expect(effectiveRatio(HYATT_4_3)).toBeCloseTo(0.75);
    expect(formatRatio(HYATT_4_3)).toBe('4:3');
    expect(formatRatio({ chase: 1000, partner: 750 })).toBe('4:3');
  });
});

describe('card-specific ratios', () => {
  const hyatt = SEED_PARTNERS.find((p) => p.id === 'world-of-hyatt')!;
  it('Sapphire Preferred gets 4:3 Hyatt', () => expect(ratioFor(hyatt, 'csp')).toEqual(HYATT_4_3));
  it('Sapphire Reserve stays 1:1', () => expect(ratioFor(hyatt, 'csr')).toEqual(ONE));
});

describe('bonus status', () => {
  const base: TransferBonus = {
    id: 'b', partnerId: 'british-airways', bonusPercent: 30, endDate: '2026-12-01', eligibility: '', targeted: false,
    sourceName: 'x', sourceUrl: 'https://example.com', reportedAt: '2026-11-18', createdBy: 'seed',
  };
  it('third-party reported bonus needs verification', () => expect(bonusState(base, '2026-11-18')).toBe('needs-verification'));
  it('user-verified recently → verified active', () => expect(bonusState({ ...base, verifiedAt: '2026-11-17T10:00:00Z' }, '2026-11-18')).toBe('verified-active'));
  it('stale verification falls back to needs verification', () => expect(bonusState({ ...base, verifiedAt: '2026-11-01' }, '2026-11-18', 7)).toBe('needs-verification'));
  it('expired bonus is expired even if it was verified', () => expect(bonusState({ ...base, verifiedAt: '2026-11-30' }, '2026-12-02')).toBe('expired'));
  it('the end date itself is still active', () => expect(bonusState({ ...base, verifiedAt: '2026-11-30' }, '2026-12-01')).toBe('verified-active'));
  it('upcoming bonus', () => expect(bonusState({ ...base, startDate: '2026-12-10', endDate: '2026-12-31' }, '2026-11-18')).toBe('upcoming'));
  it('bestBonusFor ignores unverified/expired unless asked', () => {
    const list = [base, { ...base, id: 'old', bonusPercent: 50, endDate: '2026-10-01', verifiedAt: '2026-09-30' }];
    expect(bestBonusFor('british-airways', list, { today: '2026-11-18' })).toBeNull();
    expect(bestBonusFor('british-airways', list, { today: '2026-11-18', includeUnverified: true })?.bonus.id).toBe('b');
  });
});
