import { cacheGet, cacheGetStale, cachePut } from '../lib/db';
import { fetchJSON } from './http';

/**
 * Exchange rates from Frankfurter (free, no key; European Central Bank reference rates,
 * published once per working day). Cached 12 h; falls back to the last cached rates offline.
 */
export interface FxRates {
  base: string;
  date: string;
  rates: Record<string, number>;
  stale?: boolean;
}

export async function getRates(base = 'USD'): Promise<FxRates> {
  const key = `fx:${base}`;
  const c = await cacheGet<FxRates>(key, 12 * 3600 * 1000);
  if (c) return c.value;
  const urls = [`https://api.frankfurter.dev/v1/latest?base=${base}`, `https://api.frankfurter.app/latest?from=${base}`];
  for (const u of urls) {
    try {
      const r = await fetchJSON<{ base: string; date: string; rates: Record<string, number> }>(u, { timeoutMs: 10000 });
      const out: FxRates = { base: r.base, date: r.date, rates: { ...r.rates, [base]: 1 } };
      await cachePut(key, out);
      return out;
    } catch {
      /* try next */
    }
  }
  const stale = await cacheGetStale<FxRates>(key);
  if (stale) return { ...stale.value, stale: true };
  throw new Error('Exchange rates unavailable (offline or service down). Enter amounts in your home currency or type a rate manually.');
}

/** Convert an amount in `currency` to the base currency using base-denominated rates. */
export function toHome(amount: number, currency: string, rates: FxRates): number | null {
  if (currency === rates.base) return amount;
  const r = rates.rates[currency];
  return r ? amount / r : null;
}

export const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'MXN', 'CAD', 'AUD', 'NZD', 'KRW', 'THB', 'SGD', 'HKD', 'TWD', 'IDR', 'VND', 'CHF', 'ISK', 'TRY', 'ZAR', 'AED', 'PEN', 'ARS', 'COP', 'CRC', 'XPF', 'FJD', 'DKK', 'SEK', 'NOK', 'CZK', 'HUF', 'PLN', 'BRL', 'CNY', 'INR'];
