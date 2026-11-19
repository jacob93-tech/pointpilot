import type { Cabin, CardId, Destination, Range, Ratio, SearchParams, TransferBonus, TransferPartner } from '../lib/types';
import { getCard } from '../data/cards';
import { PROGRAM_GUIDES, type ProgramGuide } from '../data/programs';
import { estimateAwardMiles, scaleRange } from './estimates';
import { bestBonusFor, chaseNeeded, ratioFor } from './transfer';
import { addDays, dayOfWeek, monthDates } from './flexDates';

/**
 * Booking playbook: which Chase airline partner to use for a destination, roughly how
 * many Chase points it takes (with bonuses you've VERIFIED applied), and on which dates
 * to search. Everything here is an ESTIMATE — PointPilot cannot see real flights or
 * award seats; the user confirms them on the airline's own site.
 */

export interface TransferContext {
  partners: TransferPartner[];
  bonuses: TransferBonus[];
  today: string;
  verifyWindowDays: number;
}

export interface ProgramOption {
  guide: ProgramGuide;
  partner: TransferPartner;
  ratio: Ratio;
  /** Estimated partner currency, total for all travelers, round trip */
  partnerPoints: Range;
  /** Chase points to transfer, with bonuses you've verified applied */
  chasePoints: Range;
  /** Chase points with no bonus at all */
  chasePointsNoBonus: Range;
  /** Chase points IF the reported-but-unverified bonus is real */
  chasePointsIfReported: Range | null;
  verifiedBonus: TransferBonus | null;
  reportedBonus: TransferBonus | null;
  /** How the estimate was made, in plain words */
  basis: string;
}

const round100 = (n: number) => Math.round(n / 100) * 100;

function needed(r: Range, ratio: Ratio, bonusPct: number, p: TransferPartner): Range {
  return [chaseNeeded(r[0], ratio, bonusPct, p.increment, p.minTransfer), chaseNeeded(r[1], ratio, bonusPct, p.increment, p.minTransfer)];
}

/**
 * Every Chase airline partner that's a realistic choice for this destination, cheapest
 * estimated Chase points first.
 */
export function programOptions(
  dest: Destination,
  distanceMi: number,
  cabin: Cabin,
  travelers: number,
  cashFareTotal: Range,
  cardId: CardId,
  ctx: TransferContext,
): ProgramOption[] {
  if (!getCard(cardId).transferEligible) return [];
  const out: ProgramOption[] = [];
  const band = scaleRange(estimateAwardMiles(distanceMi, cabin, dest.domestic), travelers);
  for (const guide of PROGRAM_GUIDES) {
    const partner = ctx.partners.find((p) => p.id === guide.partnerId);
    if (!partner || !partner.active) continue;
    if (guide.regions !== 'all' && !guide.regions.includes(dest.region)) continue;
    const ratio = ratioFor(partner, cardId);
    let partnerPoints: Range;
    let basis: string;
    if (guide.pricing === 'revenue' && guide.typicalCpp) {
      partnerPoints = [round100((cashFareTotal[0] * 100) / guide.typicalCpp[1]), round100((cashFareTotal[1] * 100) / guide.typicalCpp[0])];
      basis = `Estimated cash fare ÷ ${guide.typicalCpp[0]}–${guide.typicalCpp[1]}¢ per point (typical for this revenue-based program).`;
    } else {
      partnerPoints = band;
      basis = `Typical saver-award range for a ~${Math.round(distanceMi).toLocaleString()}-mile trip — not a price from ${partner.name}.`;
    }
    const opts = { today: ctx.today, verifyWindowDays: ctx.verifyWindowDays };
    const verified = bestBonusFor(partner.id, ctx.bonuses, opts);
    const reportedAny = bestBonusFor(partner.id, ctx.bonuses, { ...opts, includeUnverified: true });
    const reported = reportedAny && reportedAny.state === 'needs-verification' && (!verified || reportedAny.bonus.bonusPercent > verified.bonus.bonusPercent) ? reportedAny.bonus : null;
    const vPct = verified?.bonus.bonusPercent ?? 0;
    out.push({
      guide,
      partner,
      ratio,
      partnerPoints,
      chasePoints: needed(partnerPoints, ratio, vPct, partner),
      chasePointsNoBonus: needed(partnerPoints, ratio, 0, partner),
      chasePointsIfReported: reported ? needed(partnerPoints, ratio, reported.bonusPercent, partner) : null,
      verifiedBonus: verified?.bonus ?? null,
      reportedBonus: reported,
      basis,
    });
  }
  const m = (r: Range) => (r[0] + r[1]) / 2;
  return out.sort(
    (a, b) =>
      m(a.chasePoints) - m(b.chasePoints) ||
      Number(!!b.verifiedBonus) - Number(!!a.verifiedBonus) ||
      Number(a.partner.seedConfidence === 'reported-new') - Number(b.partner.seedConfidence === 'reported-new'),
  );
}

/**
 * The option the RANKING may assume: chart/dynamic programs only (revenue programs only
 * work where that one airline flies, which we can't know), confirmed partners only.
 * Returns null when no verified bonus makes any program cheaper than the plain estimate,
 * so the card never names a specific program without a reason.
 */
export function rankingAwardOption(options: ProgramOption[]): ProgramOption | null {
  const eligible = options.filter((o) => o.guide.pricing !== 'revenue' && o.partner.seedConfidence !== 'reported-new' && o.verifiedBonus);
  return eligible[0] ?? null;
}

/** Cheapest chart/dynamic option IF a reported-but-unverified bonus turned out to be real. */
export function rankingReportedOption(options: ProgramOption[]): ProgramOption | null {
  const eligible = options.filter((o) => o.guide.pricing !== 'revenue' && o.partner.seedConfidence !== 'reported-new' && o.chasePointsIfReported);
  return eligible.sort((a, b) => a.chasePointsIfReported![0] + a.chasePointsIfReported![1] - (b.chasePointsIfReported![0] + b.chasePointsIfReported![1]))[0] ?? null;
}

// ------------------------------------------------------------------ dates

export interface CandidateDates {
  depart: string;
  ret: string;
  label: string;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The single default date pair (kept for existing callers). */
export function suggestDates(params: SearchParams, days: number): { depart: string; ret: string } {
  return candidateDates(params, days)[0];
}

/**
 * Up to three date pairs worth searching. These are NOT price-checked — they are
 * sensible starting points (a weekend-friendly trip, a midweek departure, another week).
 */
export function candidateDates(params: SearchParams, days: number, today?: string): CandidateDates[] {
  const len = Math.max(1, days) - 1;
  if (params.dateMode === 'specific' && params.departDates[0]) {
    const ret = params.returnDates.find((r) => r > params.departDates[0]) ?? addDays(params.departDates[0], len);
    return [{ depart: params.departDates[0], ret, label: 'Your dates' }];
  }
  if (params.dateMode === 'range' && params.rangeStart) {
    const out: CandidateDates[] = [{ depart: params.rangeStart, ret: addDays(params.rangeStart, len), label: 'Start of your range' }];
    if (params.rangeEnd) {
      const lastDepart = addDays(params.rangeEnd, -len);
      if (lastDepart > params.rangeStart) out.push({ depart: lastDepart, ret: params.rangeEnd, label: 'End of your range' });
    }
    return out;
  }
  const all = monthDates(params.year, params.month).filter((d) => !today || d > today);
  const on = (dow: number) => all.filter((d) => dayOfWeek(d) === dow);
  const fri = on(5);
  const thu = on(4);
  const tue = on(2);
  const sat = on(6);
  const picks: CandidateDates[] = [];
  const add = (d: string | undefined, why: string) => {
    if (!d || picks.some((p) => p.depart === d)) return;
    picks.push({ depart: d, ret: addDays(d, len), label: `${DOW[dayOfWeek(d)]} departure · ${why}` });
  };
  if (params.dateMode === 'weekends') {
    add(fri[1] ?? fri[0], 'weekend');
    add(thu[2] ?? thu[thu.length - 1], 'long weekend');
    add(fri[3] ?? fri[fri.length - 1], 'later weekend');
  } else {
    add(fri[1] ?? fri[0], 'weekend-friendly');
    add(tue[2] ?? tue[tue.length - 1], 'midweek flights are often cheaper');
    add(sat[0] ?? sat[sat.length - 1], 'early in the month');
  }
  if (!picks.length) {
    // whole month is in the past relative to today — fall back to the 2nd Friday
    const f = monthDates(params.year, params.month).filter((d) => dayOfWeek(d) === 5);
    const d = f[1] ?? f[0];
    picks.push({ depart: d, ret: addDays(d, len), label: 'Fri departure' });
  }
  return picks;
}
