import { clsx } from 'clsx';
import { daysInMonth } from '../engine/flexDates';

/** Accessible month grid. Clicking a day toggles it via onToggle. `marks` can tint days (e.g. price levels). */
export function MonthCalendar({
  year,
  month,
  selected,
  onToggle,
  marks,
  disabledBefore,
  label,
}: {
  year: number;
  month: number;
  selected: string[];
  onToggle: (iso: string) => void;
  marks?: Record<string, 'low' | 'mid' | 'high' | 'info'>;
  disabledBefore?: string;
  label?: string;
}) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const n = daysInMonth(year, month);
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: n }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)];
  const title = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{label ? `${label} · ${title}` : title}</div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px]" role="grid" aria-label={label ?? title}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="py-1 font-medium text-slate-400" aria-hidden>
            {d}
          </div>
        ))}
        {cells.map((c, i) => {
          if (!c) return <div key={i} />;
          const sel = selected.includes(c);
          const disabled = !!disabledBefore && c < disabledBefore;
          const mark = marks?.[c];
          return (
            <button
              key={c}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(c)}
              aria-pressed={sel}
              aria-label={c}
              className={clsx(
                'tabular rounded-md py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30',
                sel
                  ? 'bg-brand-600 text-white'
                  : mark === 'low'
                    ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200'
                    : mark === 'mid'
                      ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
                      : mark === 'high'
                        ? 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200'
                        : mark === 'info'
                          ? 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800',
              )}
            >
              {Number(c.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
