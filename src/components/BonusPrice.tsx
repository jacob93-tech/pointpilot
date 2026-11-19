import { Sparkles, Lock } from 'lucide-react';
import { clsx } from 'clsx';
import type { TripEstimate } from '../engine/ranking';
import { kpts, ptsRange } from '../lib/format';
import { mid } from '../engine/estimates';

/**
 * The "with transfer bonus" price, shown next to the plain Chase points cost.
 *  - verified bonus  → bright gradient pill (it's applied)
 *  - reported only   → dashed "locked" pill: what it WOULD cost if you verify it on Chase
 */
export function BonusPrice({ t, compact, className }: { t: TripEstimate; compact?: boolean; className?: string }) {
  const s = t.recommended;
  const ap = t.flight.awardProgram;
  if (ap) {
    const usedInPlan = s.flightMethod === 'award';
    const withBonus = usedInPlan ? s.pointsRange : t.flight.awardPoints!;
    const without = usedInPlan ? s.pointsRangeNoBonus : ap.pointsNoBonus;
    const saved = Math.max(0, mid(without) - mid(withBonus));
    return (
      <div
        className={clsx(
          'relative overflow-hidden rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-500 to-orange-400 px-3 py-2 text-white shadow-md shadow-pink-500/20',
          className,
        )}
        title={`Uses your verified +${ap.bonusPercent}% ${ap.name} transfer bonus. Still an estimate — confirm award seats before transferring.`}
      >
        <Sparkles className="pointer-events-none absolute -right-1 -top-1 h-10 w-10 rotate-12 text-white/20" aria-hidden />
        <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-white/90">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {usedInPlan ? 'With transfer bonus' : 'Flights on points w/ bonus'}
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className={clsx('tabular font-extrabold', compact ? 'text-base' : 'text-lg')}>{ptsRange(withBonus)} pts</span>
          <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold">
            +{ap.bonusPercent}% {ap.name}
          </span>
        </div>
        {saved >= 500 && <div className="text-[11px] text-white/90">Saves ~{kpts(saved)} points vs. no bonus</div>}
      </div>
    );
  }
  const rep = t.flight.reportedBonus;
  if (rep) {
    return (
      <div
        className={clsx('rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/60 px-3 py-2 text-amber-900 dark:border-amber-500/60 dark:bg-amber-900/20 dark:text-amber-200', className)}
        title="Reported by a third party. Verify it on your Chase transfer screen (Transfer Bonuses page) to apply it."
      >
        <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide">
          <Lock className="h-3.5 w-3.5" aria-hidden /> Bonus to unlock
        </div>
        <div className="tabular text-sm font-bold">
          Flights ~{ptsRange(rep.pointsIfReal)} pts <span className="font-semibold">with +{rep.bonusPercent}% {rep.name}</span>
        </div>
        <div className="text-[11px]">Reported, not verified — check Chase, then tap Verify on Transfer Bonuses.</div>
      </div>
    );
  }
  return null;
}
