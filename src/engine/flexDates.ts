import type { SearchParams } from '../lib/types';

export interface DatePair {
  depart: string;
  ret: string;
  days: number;
  nights: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const parseISO = (s: string) => new Date(s + 'T00:00:00Z');
export const addDays = (s: string, n: number) => {
  const d = parseISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
export const dayOfWeek = (s: string) => parseISO(s).getUTCDay();
export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export function monthDates(year: number, month: number): string[] {
  const n = daysInMonth(year, month);
  return Array.from({ length: n }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`);
}

/**
 * Trip "days" counts both travel days: depart Apr 10, return Apr 15 = 6 days / 5 nights.
 * Generates every candidate (depart, return) pair allowed by the date mode and duration.
 */
export function generateDatePairs(
  p: Pick<SearchParams, 'dateMode' | 'year' | 'month' | 'rangeStart' | 'rangeEnd' | 'departDates' | 'returnDates' | 'minDays' | 'maxDays'>,
  today?: string,
): DatePair[] {
  const minD = Math.max(1, Math.min(p.minDays, p.maxDays));
  const maxD = Math.max(minD, p.maxDays);
  const out: DatePair[] = [];
  const push = (depart: string, ret: string) => {
    const nights = Math.round((parseISO(ret).getTime() - parseISO(depart).getTime()) / 86400000);
    const days = nights + 1;
    if (nights < 0 || days < minD || days > maxD) return;
    if (today && depart < today) return;
    out.push({ depart, ret, days, nights });
  };

  switch (p.dateMode) {
    case 'month': {
      for (const d of monthDates(p.year, p.month)) for (let len = minD; len <= maxD; len++) push(d, addDays(d, len - 1));
      break;
    }
    case 'weekends': {
      // depart Thu/Fri/Sat, return Sun/Mon; still bounded by the duration range
      for (const d of monthDates(p.year, p.month)) {
        const dow = dayOfWeek(d);
        if (dow !== 4 && dow !== 5 && dow !== 6) continue;
        for (let len = minD; len <= maxD; len++) {
          const r = addDays(d, len - 1);
          const rd = dayOfWeek(r);
          if (rd === 0 || rd === 1) push(d, r);
        }
      }
      break;
    }
    case 'range': {
      if (!p.rangeStart || !p.rangeEnd || p.rangeEnd < p.rangeStart) break;
      for (let d = p.rangeStart; d <= p.rangeEnd; d = addDays(d, 1)) {
        for (let len = minD; len <= maxD; len++) {
          const r = addDays(d, len - 1);
          if (r <= p.rangeEnd) push(d, r);
        }
      }
      break;
    }
    case 'specific': {
      for (const d of p.departDates) for (const r of p.returnDates) push(d, r);
      break;
    }
  }
  return out;
}

/** Net cost of an option including getting to the departure airport. */
export function netFlightCost(pricePerPerson: number, travelers: number, groundCost: number): number {
  return pricePerPerson * travelers + groundCost;
}
