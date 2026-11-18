import { clsx } from 'clsx';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { TriangleAlert, CheckCircle2, ExternalLink as ExtIcon, Info, Loader2, X } from 'lucide-react';
import type { BonusState, DataQuality } from '../lib/types';

// ---------------------------------------------------------------- Button

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'secondary', size = 'md', className, loading, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'px-2.5 py-1.5 text-xs',
        size === 'md' && 'px-3.5 py-2 text-sm',
        size === 'lg' && 'px-5 py-3 text-base',
        variant === 'primary' && 'bg-brand-600 text-white shadow-sm hover:bg-brand-700',
        variant === 'secondary' && 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
        variant === 'danger' && 'bg-rose-600 text-white hover:bg-rose-700',
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Card

export function Card({ className, children, title, action, subtitle }: { className?: string; children: ReactNode; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <section className={clsx('rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900', className)}>
      {(title || action) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- Badges

const badgeTone = {
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  red: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  brand: 'bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200',
};
export type Tone = keyof typeof badgeTone;

export function Badge({ tone = 'slate', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', badgeTone[tone], className)}>
      {children}
    </span>
  );
}

const QUALITY: Record<DataQuality, { label: string; tone: Tone; tip: string }> = {
  live: { label: 'Live', tone: 'green', tip: 'Fetched just now from a live free service.' },
  cached: { label: 'Cached', tone: 'blue', tip: 'Previously fetched data, shown with its timestamp. Not live.' },
  user: { label: 'Your quote', tone: 'violet', tip: 'Entered by you.' },
  reported: { label: 'Needs verification', tone: 'amber', tip: 'Reported by a third party; not confirmed with Chase.' },
  estimate: { label: 'Estimate', tone: 'amber', tip: 'Heuristic range — not a price quote.' },
  example: { label: 'Example', tone: 'slate', tip: 'Demonstration data.' },
};
export function QualityBadge({ q, className }: { q: DataQuality; className?: string }) {
  const m = QUALITY[q];
  return (
    <Badge tone={m.tone} title={m.tip} className={className}>
      {m.label}
    </Badge>
  );
}

const BONUS: Record<BonusState, { label: string; tone: Tone }> = {
  'verified-active': { label: 'Verified active', tone: 'green' },
  'needs-verification': { label: 'Needs verification', tone: 'amber' },
  expired: { label: 'Expired', tone: 'red' },
  upcoming: { label: 'Upcoming', tone: 'blue' },
};
export function BonusBadge({ state, targeted }: { state: BonusState; targeted?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge tone={BONUS[state].tone}>{BONUS[state].label}</Badge>
      {targeted && <Badge tone="violet">Targeted / eligibility-dependent</Badge>}
    </span>
  );
}

// ---------------------------------------------------------------- Form controls

export function Field({ label, hint, children, className, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

const inputCls =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

/** Apply w-full unless the caller sets its own width (avoids w-full vs w-20 CSS-order conflicts). */
const widthOf = (className?: string) => (/(^|\s)(w-|min-w-|max-w-)/.test(className ?? '') ? '' : 'w-full');

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={clsx(inputCls, widthOf(className), className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={clsx(inputCls, widthOf(className), 'pr-8', className)}>
      {children}
    </select>
  );
}

export function TextArea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={clsx(inputCls, 'w-full min-h-[72px]', className)} />;
}

/** Number input that tolerates empty/partial typing and clamps on blur. */
export function NumberInput({ value, onChange, min, max, step, className, id, placeholder, allowEmpty, 'aria-label': ariaLabel }: {
  value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; className?: string; id?: string; placeholder?: string; allowEmpty?: boolean; 'aria-label'?: string;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    setText((t) => (Number(t.replace(/,/g, '')) === value ? t : value == null ? '' : String(value)));
  }, [value]);
  return (
    <input
      id={id}
      aria-label={ariaLabel}
      inputMode="decimal"
      className={clsx(inputCls, widthOf(className), 'tabular', className)}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const n = Number(t.replace(/,/g, ''));
        if (t.trim() === '') { if (allowEmpty) onChange(null); return; }
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => {
        const n = Number(text.replace(/,/g, ''));
        if (text.trim() === '' ) { if (!allowEmpty) setText(value == null ? '' : String(value)); return; }
        if (!Number.isFinite(n)) { setText(value == null ? '' : String(value)); return; }
        let c = n;
        if (min != null) c = Math.max(min, c);
        if (max != null) c = Math.min(max, c);
        if (step && step >= 1) c = Math.round(c);
        setText(String(c));
        if (c !== value) onChange(c);
      }}
    />
  );
}

// ---------------------------------------------------------------- Misc

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={clsx('min-w-0', className)}>
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="tabular mt-0.5 truncate text-xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}

export function ScoreBar({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const tone = value >= 70 ? 'bg-emerald-500' : value >= 45 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div title={hint}>
      <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-400">
        <span>{label}</span>
        <span className="tabular font-semibold">{value}</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={clsx('h-full rounded-full', tone)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function ExternalLink({ href, children, className, showIcon = true }: { href: string; children: ReactNode; className?: string; showIcon?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className={clsx('inline-flex items-center gap-1 text-brand-700 underline-offset-2 hover:underline dark:text-brand-300', className)}>
      {children}
      {showIcon && <ExtIcon className="h-3 w-3 shrink-0" aria-hidden />}
      <span className="sr-only">(opens in new tab)</span>
    </a>
  );
}

export function Notice({ tone = 'info', children, className, title }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: ReactNode; className?: string; title?: ReactNode }) {
  const Icon = tone === 'warn' || tone === 'error' ? TriangleAlert : tone === 'success' ? CheckCircle2 : Info;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'note'}
      className={clsx(
        'flex gap-2.5 rounded-xl border px-3 py-2.5 text-sm',
        tone === 'info' && 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200',
        tone === 'warn' && 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
        tone === 'error' && 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
        tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-700">
      {icon && <div className="mb-2 text-slate-400">{icon}</div>}
      <h3 className="font-semibold">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-500" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </span>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            value === t.id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={clsx('max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl outline-none sm:rounded-2xl sm:p-6 dark:bg-slate-900', wide ? 'sm:max-w-4xl' : 'sm:max-w-lg')}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={id} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-brand-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-brand-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Toasts

interface ToastItem { id: number; text: string; tone: 'info' | 'success' | 'error' }
const ToastCtx = createContext<(text: string, tone?: ToastItem['tone']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: ToastItem['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[1100] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg',
              t.tone === 'success' && 'bg-emerald-600 text-white',
              t.tone === 'error' && 'bg-rose-600 text-white',
              t.tone === 'info' && 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900',
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
