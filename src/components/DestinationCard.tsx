import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { TriangleAlert, Bookmark, BookmarkCheck, Clock, MapPin } from 'lucide-react';
import type { TripEstimate } from '../engine/ranking';
import { wikiSummary, type WikiSummary } from '../providers/wiki';
import { ptsRange, usdRange } from '../lib/format';
import { Badge, QualityBadge } from './ui';

const imgMemo = new Map<string, WikiSummary | null>();

export function useWiki(title: string | undefined): WikiSummary | null | undefined {
  const [s, setS] = useState<WikiSummary | null | undefined>(title ? imgMemo.get(title) : null);
  useEffect(() => {
    if (!title) return;
    if (imgMemo.has(title)) { setS(imgMemo.get(title)); return; }
    let alive = true;
    wikiSummary(title)
      .then((r) => { imgMemo.set(title, r); if (alive) setS(r); })
      .catch(() => { if (alive) setS(null); });
    return () => { alive = false; };
  }, [title]);
  return s;
}

export function DestinationImage({ title, className, alt }: { title: string; className?: string; alt: string }) {
  const s = useWiki(title);
  const [broken, setBroken] = useState(false);
  return (
    <div className={clsx('relative overflow-hidden bg-gradient-to-br from-brand-600 to-sky-700', className)}>
      {s?.imageUrl && !broken && <img src={s.imageUrl} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-full w-full object-cover" />}
      {(!s?.imageUrl || broken) && (
        <div className="flex h-full items-center justify-center text-white/80">
          <MapPin className="h-8 w-8" aria-hidden />
        </div>
      )}
    </div>
  );
}

export function DestinationCard({ t, rank, onOpen, saved, onToggleSave, badge }: { t: TripEstimate; rank?: number; onOpen: () => void; saved?: boolean; onToggleSave?: () => void; badge?: string }) {
  const d = t.destination;
  const s = t.recommended;
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <button onClick={onOpen} className="relative block text-left" aria-label={`Open details for ${d.name}`}>
        <DestinationImage title={d.wikiTitle} alt={d.name} className="h-36 w-full" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2">
          {rank != null && <span className="rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">#{rank}</span>}
          {badge && <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-slate-800">{badge}</span>}
        </div>
        <div className="absolute bottom-2 right-2 rounded-xl bg-white/95 px-2.5 py-1 text-center shadow dark:bg-slate-900/95">
          <div className="tabular text-lg font-bold leading-none text-brand-700 dark:text-brand-300">{t.overall}</div>
          <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">score</div>
        </div>
      </button>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{d.name}</h3>
            <p className="text-xs text-slate-500">
              {d.country} · from {t.origin.code} · <Clock className="inline h-3 w-3" aria-hidden /> ~{t.flightHours} h
            </p>
          </div>
          {onToggleSave && (
            <button onClick={onToggleSave} aria-label={saved ? 'Remove from saved destinations' : 'Save destination'} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              {saved ? <BookmarkCheck className="h-5 w-5 text-brand-600" /> : <Bookmark className="h-5 w-5" />}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 text-xs dark:bg-slate-800/60">
          <div>
            <div className="text-slate-500">Cash out of pocket</div>
            <div className="tabular font-semibold">{usdRange(s.cashRange)}</div>
          </div>
          <div>
            <div className="text-slate-500">Points</div>
            <div className="tabular font-semibold">{s.points ? ptsRange(s.pointsRange) : 'None — pay cash'}</div>
          </div>
        </div>
        <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
          {s.label}
          {s.cpp != null && <span className="tabular"> · ≈{s.cpp.toFixed(2)}¢/pt</span>}
        </p>
        <div className="mt-auto flex flex-wrap gap-1">
          <QualityBadge q={t.estimateOnly ? 'estimate' : 'user'} />
          {t.feasible ? <Badge tone="green">Fits budget</Badge> : <Badge tone="red">Over budget / points</Badge>}
          {d.advisoryLevel != null && d.advisoryLevel >= 3 && (
            <Badge tone="red">
              <TriangleAlert className="h-3 w-3" /> Advisory L{d.advisoryLevel}
            </Badge>
          )}
        </div>
      </div>
    </article>
  );
}
