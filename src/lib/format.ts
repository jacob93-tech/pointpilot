import type { Range } from './types';

export const usd = (n: number, digits = 0) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';

export const money = (n: number, currency = 'USD', digits = 0) => {
  try {
    return n.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: digits, minimumFractionDigits: digits });
  } catch {
    return `${n.toFixed(digits)} ${currency}`;
  }
};

export const pts = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('en-US'));

export const kpts = (n: number) => (n >= 1000 ? `${Math.round(n / 1000).toLocaleString()}k` : String(Math.round(n)));

export const usdRange = (r: Range) => (Math.round(r[0]) === Math.round(r[1]) ? usd(r[0]) : `${usd(r[0])}–${usd(r[1])}`);

export const ptsRange = (r: Range) => (Math.round(r[0]) === Math.round(r[1]) ? pts(r[0]) : `${kpts(r[0])}–${kpts(r[1])}`);

export const cpp = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : `${n.toFixed(2)}¢`);

export function fmtDate(iso?: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!iso) return '—';
  const d = iso.length === 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', opts);
}

export function fmtDateTime(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function relTime(iso?: string): string {
  if (!iso) return 'never';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export const clampNum = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};
