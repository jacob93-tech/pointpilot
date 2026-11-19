import { useEffect, useMemo, useRef, useState } from 'react';
import { DESTINATIONS } from '../data/destinations';
import { rankDestinations, type RankResult, type WeatherStats } from '../engine/ranking';
import { weatherForAll } from '../providers/weather';
import { cacheGetStale } from './db';
import { useOnline, useTransferContext, useUserQuotes } from './hooks';
import type { Profile, SearchParams } from './types';

export interface WeatherLoad {
  loading: boolean;
  ok: number;
  failed: number;
  done: boolean;
  rateLimited?: boolean;
}

/** Loads cached historical weather immediately, then (if online) fetches missing months from Open-Meteo. */
export function useMonthWeather(month: number, enabled: boolean): [Record<string, WeatherStats | undefined>, WeatherLoad] {
  const [wx, setWx] = useState<Record<string, WeatherStats | undefined>>({});
  const [load, setLoad] = useState<WeatherLoad>({ loading: false, ok: 0, failed: 0, done: false });
  const online = useOnline();
  const runId = useRef(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const id = ++runId.current;
    setWx({});
    (async () => {
      const cached: Record<string, WeatherStats> = {};
      for (const d of DESTINATIONS) {
        const c = await cacheGetStale<WeatherStats>(`wx2:${d.id}:${month}`);
        if (c) cached[d.id] = c.value;
      }
      if (id !== runId.current) return;
      setWx(cached);
      const missing = DESTINATIONS.filter((d) => !cached[d.id]);
      if (!enabled || !online || !missing.length) {
        setLoad({ loading: false, ok: Object.keys(cached).length, failed: 0, done: true });
        return;
      }
      setLoad({ loading: true, ok: Object.keys(cached).length, failed: 0, done: false });
      const r = await weatherForAll(missing, month, (destId, w) => {
        if (id !== runId.current || !w) return;
        setWx((cur) => ({ ...cur, [destId]: w }));
      });
      if (id !== runId.current) return;
      setLoad({ loading: false, ok: Object.keys(cached).length + r.ok, failed: r.failed, done: true, rateLimited: r.rateLimited });
      // Free tier per-minute limit: try the rest again after a minute (cached ones are skipped).
      if (r.rateLimited) setTimeout(() => id === runId.current && setRetry((n) => n + 1), 65_000);
    })();
  }, [month, enabled, online, retry]);

  return [wx, load];
}

export function useRanking(params: SearchParams, profile: Profile, fetchWeather = true): { result: RankResult; weather: WeatherLoad } {
  const quotes = useUserQuotes(profile);
  const transfer = useTransferContext(profile);
  const [wx, load] = useMonthWeather(params.month, fetchWeather);
  const result = useMemo(
    () => rankDestinations(params, { minAcceptableCpp: profile.minAcceptableCpp, weather: wx, quotes, transfer }),
    [params, profile.minAcceptableCpp, wx, quotes, transfer],
  );
  return { result, weather: load };
}
