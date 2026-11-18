import type { Availability, CardId, Comparison, Ratio, RedemptionOption, TransferBonus, TransferPartner } from '../lib/types';
import { getCard } from '../data/cards';
import { bestBonusFor, planTransfer, ratioFor, type TransferPlan } from './transfer';

/**
 * Cents per point:
 *   value avoided = comparable cash price (taxes included) − cash you still pay for the award
 *                   (taxes/fees) − any additional cash costs the award forces on you
 *   cpp = value avoided / Chase points × 100
 * Taxes are never double counted: the cash price includes taxes once, and the award's
 * taxes are subtracted once.
 */
export function centsPerPoint(cashPrice: number, awardCash: number, chasePoints: number, additionalCosts = 0): number | null {
  if (!(chasePoints > 0) || !Number.isFinite(cashPrice)) return null;
  const avoided = cashPrice - awardCash - additionalCosts;
  return (avoided / chasePoints) * 100;
}

export type Verdict = 'excellent' | 'good' | 'weak' | 'poor' | 'unknown';

export interface VerdictResult {
  verdict: Verdict;
  headline: string;
  detail: string;
}

/**
 * Verdict tiers relative to (a) the card's guaranteed floor (Chase Travel base rate / cash back)
 * and (b) the user's own minimum. No universal threshold is imposed.
 */
export function judge(cpp: number | null, floorCpp: number, minAcceptableCpp: number): VerdictResult {
  if (cpp === null || !Number.isFinite(cpp)) {
    return { verdict: 'unknown', headline: 'Not enough data', detail: 'Enter a comparable cash price and the points required.' };
  }
  const c = cpp.toFixed(2);
  if (cpp < floorCpp) {
    return {
      verdict: 'poor',
      headline: `${c}¢/pt — below your ${floorCpp.toFixed(2)}¢ floor`,
      detail: `You'd get more value booking through Chase Travel or redeeming for cash. Pay cash or use Chase Travel instead.`,
    };
  }
  if (cpp < minAcceptableCpp) {
    return {
      verdict: 'weak',
      headline: `${c}¢/pt — below your ${minAcceptableCpp.toFixed(2)}¢ target`,
      detail: `Better than the floor, but under the minimum you set. Consider paying cash and saving points unless cash is tight.`,
    };
  }
  if (cpp < minAcceptableCpp * 1.5) {
    return {
      verdict: 'good',
      headline: `${c}¢/pt — meets your target`,
      detail: `A solid redemption by your own standard.`,
    };
  }
  return {
    verdict: 'excellent',
    headline: `${c}¢/pt — well above your target`,
    detail: `Strong value — but only if the cash price is for an itinerary you'd genuinely buy.`,
  };
}

export interface EvaluatedOption {
  option: RedemptionOption;
  label: string;
  partner?: TransferPartner;
  ratio?: Ratio;
  bonus?: TransferBonus | null;
  unverifiedBonus?: TransferBonus | null;
  plan?: TransferPlan;
  /** plan if the unverified (reported) bonus turned out to be real */
  planIfReportedBonus?: TransferPlan;
  chasePoints: number | null;
  cashOutOfPocket: number;
  cpp: number | null;
  cashSaved: number | null;
  remainingPoints: number | null;
  verdict: VerdictResult;
  warnings: string[];
  eligible: boolean;
}

export interface EvaluateContext {
  cardId: CardId;
  balance: number;
  minAcceptableCpp: number;
  partners: TransferPartner[];
  bonuses: TransferBonus[];
  today?: string;
  verifyWindowDays?: number;
  additionalCosts?: number;
}

export function evaluateOption(cmp: Pick<Comparison, 'cashPrice'>, o: RedemptionOption, ctx: EvaluateContext): EvaluatedOption {
  const card = getCard(ctx.cardId);
  const warnings: string[] = [];
  const cashPrice = cmp.cashPrice;
  const extra = ctx.additionalCosts ?? 0;

  if (o.method === 'chase-travel') {
    const pts = o.chaseTravelPoints ?? null;
    const cpp = cashPrice != null && pts ? centsPerPoint(cashPrice, o.taxesFees, pts, extra) : null;
    if (cashPrice == null) warnings.push('No comparable cash price recorded — value per point can’t be computed.');
    return {
      option: o,
      label: 'Chase Travel',
      chasePoints: pts,
      cashOutOfPocket: o.taxesFees + extra,
      cpp,
      cashSaved: cashPrice != null ? cashPrice - o.taxesFees - extra : null,
      remainingPoints: pts != null ? ctx.balance - pts : null,
      verdict: judge(cpp, card.travelBaseCpp, ctx.minAcceptableCpp),
      warnings: pts != null && pts > ctx.balance ? [...warnings, 'Not enough points.'] : warnings,
      eligible: true,
    };
  }

  const partner = ctx.partners.find((p) => p.id === o.partnerId);
  if (!partner || !o.partnerPoints) {
    return {
      option: o,
      label: partner?.name ?? 'Unknown partner',
      partner,
      chasePoints: null,
      cashOutOfPocket: o.taxesFees + extra,
      cpp: null,
      cashSaved: null,
      remainingPoints: null,
      verdict: judge(null, card.travelBaseCpp, ctx.minAcceptableCpp),
      warnings: ['Choose a partner and enter the partner miles required.'],
      eligible: card.transferEligible,
    };
  }
  const ratio = ratioFor(partner, ctx.cardId);
  const opts = { today: ctx.today, verifyWindowDays: ctx.verifyWindowDays };
  const verified = bestBonusFor(partner.id, ctx.bonuses, opts);
  const reported = bestBonusFor(partner.id, ctx.bonuses, { ...opts, includeUnverified: true });
  const plan = planTransfer(o.partnerPoints, ratio, verified?.bonus.bonusPercent ?? 0, partner.increment, partner.minTransfer);
  const planIfReportedBonus =
    reported && reported.state === 'needs-verification'
      ? planTransfer(o.partnerPoints, ratio, reported.bonus.bonusPercent, partner.increment, partner.minTransfer)
      : undefined;

  const cpp = cashPrice != null ? centsPerPoint(cashPrice, o.taxesFees, plan.chasePoints, extra) : null;
  if (!card.transferEligible) warnings.push(`${card.name} can’t transfer points on its own — combine points into a Sapphire or Ink Preferred account first.`);
  if (o.availability !== 'seen-available') {
    warnings.push(
      o.availability === 'unavailable'
        ? 'Award space is marked UNAVAILABLE — do not transfer.'
        : 'Award availability not confirmed. Find bookable space on the partner site BEFORE transferring — transfers are irreversible.',
    );
  }
  if (plan.chasePoints > ctx.balance) warnings.push(`Needs ${plan.chasePoints.toLocaleString()} Chase points; you have ${ctx.balance.toLocaleString()}.`);
  if (cashPrice == null) warnings.push('No comparable cash price recorded — value per point can’t be computed.');
  if (partner.seedConfidence === 'reported-new' && !partner.userVerifiedAt) warnings.push(`${partner.name} is a newly reported partner — confirm it appears in your Chase account.`);

  return {
    option: o,
    label: partner.program.toLowerCase().includes(partner.name.toLowerCase()) ? partner.program : `${partner.name} ${partner.program}`,
    partner,
    ratio,
    bonus: verified?.bonus ?? null,
    unverifiedBonus: planIfReportedBonus ? reported!.bonus : null,
    plan,
    planIfReportedBonus,
    chasePoints: plan.chasePoints,
    cashOutOfPocket: o.taxesFees + extra,
    cpp,
    cashSaved: cashPrice != null ? cashPrice - o.taxesFees - extra : null,
    remainingPoints: ctx.balance - plan.chasePoints,
    verdict: judge(cpp, card.travelBaseCpp, ctx.minAcceptableCpp),
    warnings,
    eligible: card.transferEligible && o.availability !== 'unavailable',
  };
}

export interface ComparisonSummary {
  evaluated: EvaluatedOption[];
  best: EvaluatedOption | null;
  recommendation: string;
  payCash: boolean;
}

/** Recommends the best eligible option — or paying cash when no option clears the user's minimum. */
export function summarizeComparison(cmp: Comparison, ctx: EvaluateContext): ComparisonSummary {
  const evaluated = cmp.options.map((o) => evaluateOption(cmp, o, ctx));
  const usable = evaluated.filter(
    (e) => e.eligible && e.cpp != null && e.chasePoints != null && e.chasePoints <= ctx.balance,
  );
  usable.sort((a, b) => (b.cpp ?? 0) - (a.cpp ?? 0));
  const best = usable[0] ?? null;
  if (cmp.cashPrice == null) {
    return { evaluated, best: null, payCash: false, recommendation: 'Record the cash price of a comparable itinerary to compare options.' };
  }
  if (!best) {
    return {
      evaluated,
      best: null,
      payCash: true,
      recommendation: `No points option is usable right now (insufficient points, unavailable space, or missing data). Paying cash: $${cmp.cashPrice.toFixed(2)}.`,
    };
  }
  const availabilityOk = best.option.method === 'chase-travel' || best.option.availability === 'seen-available';
  if ((best.cpp ?? 0) < ctx.minAcceptableCpp) {
    return {
      evaluated,
      best,
      payCash: true,
      recommendation: `Best points option is ${best.label} at ${best.cpp!.toFixed(2)}¢/pt — under your ${ctx.minAcceptableCpp.toFixed(2)}¢ minimum. Paying cash and saving points looks better unless you need to preserve cash.`,
    };
  }
  return {
    evaluated,
    best,
    payCash: false,
    recommendation: `${best.label}: ${best.chasePoints!.toLocaleString()} Chase points + $${best.cashOutOfPocket.toFixed(2)} cash ≈ ${best.cpp!.toFixed(2)}¢/pt.${availabilityOk ? '' : ' Confirm award space before transferring — transfers are irreversible.'}`,
  };
}

export function availabilityLabel(a: Availability): string {
  return a === 'seen-available' ? 'Seen available' : a === 'unavailable' ? 'Unavailable' : 'Not checked';
}
