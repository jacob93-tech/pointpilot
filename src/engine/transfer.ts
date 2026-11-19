import type { BonusState, CardId, Ratio, TransferBonus, TransferPartner } from '../lib/types';
import { getCard } from '../data/cards';

/**
 * Transfer math is done in integers (basis points) to avoid floating-point drift.
 * Chase transfers in fixed increments (1,000) with a minimum (1,000); the partner
 * receives floor(chase × partnerRatio/chaseRatio × (1 + bonus)).
 */

export function bonusToBp(bonusPercent: number): number {
  return Math.round(bonusPercent * 100);
}

/** Partner points received for a given Chase transfer, after ratio and bonus. */
export function partnerReceived(chasePoints: number, ratio: Ratio, bonusPercent = 0): number {
  if (chasePoints <= 0) return 0;
  const bp = bonusToBp(bonusPercent);
  // floor(chase * partner * (10000 + bp) / (chaseR * 10000)) — all integers, < 2^53 for realistic inputs
  return Math.floor((chasePoints * ratio.partner * (10000 + bp)) / (ratio.chase * 10000));
}

export interface TransferPlan {
  /** Chase points to transfer (multiple of increment, >= minimum) */
  chasePoints: number;
  /** partner points that will arrive */
  partnerPoints: number;
  /** partner points left over after the award */
  leftover: number;
  /** Chase points that would be needed with no bonus (same increments) */
  chasePointsWithoutBonus: number;
  /** Chase points saved by the bonus */
  savedByBonus: number;
  effectiveRatio: number;
}

/** Smallest valid Chase transfer that yields at least `partnerNeeded` partner points. */
export function chaseNeeded(
  partnerNeeded: number,
  ratio: Ratio,
  bonusPercent = 0,
  increment = 1000,
  minimum = 1000,
): number {
  if (!Number.isFinite(partnerNeeded) || partnerNeeded <= 0) return 0;
  if (ratio.chase <= 0 || ratio.partner <= 0) throw new Error('Invalid transfer ratio');
  if (increment <= 0) throw new Error('Invalid increment');
  const bp = bonusToBp(bonusPercent);
  const raw = (partnerNeeded * ratio.chase * 10000) / (ratio.partner * (10000 + bp));
  let c = Math.max(minimum, Math.ceil(raw / increment) * increment);
  // correct any floating error in either direction
  while (partnerReceived(c, ratio, bonusPercent) < partnerNeeded) c += increment;
  while (c - increment >= minimum && partnerReceived(c - increment, ratio, bonusPercent) >= partnerNeeded) c -= increment;
  return c;
}

export function planTransfer(
  partnerNeeded: number,
  ratio: Ratio,
  bonusPercent = 0,
  increment = 1000,
  minimum = 1000,
): TransferPlan {
  const chasePoints = chaseNeeded(partnerNeeded, ratio, bonusPercent, increment, minimum);
  const partnerPoints = partnerReceived(chasePoints, ratio, bonusPercent);
  const chasePointsWithoutBonus = chaseNeeded(partnerNeeded, ratio, 0, increment, minimum);
  return {
    chasePoints,
    partnerPoints,
    leftover: Math.max(0, partnerPoints - partnerNeeded),
    chasePointsWithoutBonus,
    savedByBonus: chasePointsWithoutBonus - chasePoints,
    effectiveRatio: effectiveRatio(ratio, bonusPercent),
  };
}

/** Partner points per 1 Chase point after bonus. */
export function effectiveRatio(ratio: Ratio, bonusPercent = 0): number {
  return (ratio.partner / ratio.chase) * (1 + bonusPercent / 100);
}

export function formatRatio(ratio: Ratio): string {
  const g = gcd(ratio.chase, ratio.partner);
  return `${ratio.chase / g}:${ratio.partner / g}`;
}

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

/** Ratio that applies for a given card (card overrides take precedence). */
export function ratioFor(partner: TransferPartner, cardId: CardId): Ratio {
  return getCard(cardId).ratioOverrides?.[partner.id] ?? partner.ratio;
}

// ---------------------------------------------------------------- bonuses

export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Calendar date (YYYY-MM-DD) of a stored value in the user's own timezone.
 * Full timestamps (from nowISO(), stored in UTC) are converted to local time;
 * plain dates are returned unchanged. Without this, a click made in the
 * evening in the Americas is stamped "tomorrow" in UTC and fails the
 * verification-window check.
 */
export function localDateOf(iso: string): string {
  if (iso.length <= 10) return iso;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : todayISO(d);
}

export function daysBetween(aISO: string, bISO: string): number {
  const a = Date.parse(aISO.slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(bISO.slice(0, 10) + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

/**
 * Status is ALWAYS computed — never stored — so an old promotion can never be shown as active.
 *  - expired: end date has passed
 *  - upcoming: start date in the future
 *  - verified-active: user confirmed it on Chase within the verification window
 *  - needs-verification: everything else (third-party reports, stale confirmations, no end date)
 */
export function bonusState(b: TransferBonus, today = todayISO(), verifyWindowDays = 7): BonusState {
  if (b.endDate && b.endDate < today) return 'expired';
  if (b.startDate && b.startDate > today) return 'upcoming';
  if (b.verifiedAt) {
    const age = daysBetween(localDateOf(b.verifiedAt), today);
    if (age >= 0 && age <= verifyWindowDays) return 'verified-active';
  }
  return 'needs-verification';
}

export interface ApplicableBonus {
  bonus: TransferBonus;
  state: BonusState;
}

/** Best bonus for a partner. By default only verified-active bonuses are applied in math. */
export function bestBonusFor(
  partnerId: string,
  bonuses: TransferBonus[],
  opts: { today?: string; verifyWindowDays?: number; includeUnverified?: boolean } = {},
): ApplicableBonus | null {
  const today = opts.today ?? todayISO();
  let best: ApplicableBonus | null = null;
  for (const b of bonuses) {
    if (b.partnerId !== partnerId) continue;
    const state = bonusState(b, today, opts.verifyWindowDays);
    const ok = state === 'verified-active' || (opts.includeUnverified && state === 'needs-verification');
    if (!ok) continue;
    if (!best || b.bonusPercent > best.bonus.bonusPercent) best = { bonus: b, state };
  }
  return best;
}
