import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, defaultProfile, defaultSearch, nowISO } from './db';
import type { Comparison, Profile, SearchParams } from './types';
import type { UserQuote } from '../engine/ranking';
import { summarizeComparison } from '../engine/redemption';
import { todayISO } from '../engine/transfer';
import type { TransferContext } from '../engine/playbook';

const FALLBACK_PROFILE = defaultProfile();

/** Partners + bonuses for transfer math, stable while unchanged. Undefined until IndexedDB loads. */
export function useTransferContext(profile: Profile): TransferContext | undefined {
  const partners = useLiveQuery(() => db.partners.toArray(), []);
  const bonuses = useLiveQuery(() => db.bonuses.toArray(), []);
  const today = todayISO();
  return useMemo(
    () => (partners && bonuses ? { partners, bonuses, today, verifyWindowDays: profile.bonusVerifyWindowDays } : undefined),
    [partners, bonuses, today, profile.bonusVerifyWindowDays],
  );
}

export function useProfile(): Profile {
  // stable fallback identity while IndexedDB loads (prevents render loops in memoized consumers)
  return useLiveQuery(() => db.profile.get('profile'), []) ?? FALLBACK_PROFILE;
}

export function useProfileLoaded(): Profile | undefined {
  return useLiveQuery(() => db.profile.get('profile'), []);
}

/** Last search params, persisted so Dashboard and Explore share them. */
export function useLastSearch(profile: Profile): [SearchParams, (p: SearchParams) => Promise<void>] {
  const row = useLiveQuery(() => db.meta.get('lastSearch'), []);
  const params = useMemo(() => {
    const base = defaultSearch(profile);
    const saved = row?.value as Partial<SearchParams> | undefined;
    return saved ? { ...base, ...saved } : base;
  }, [row, profile]);
  const save = async (p: SearchParams) => {
    await db.meta.put({ key: 'lastSearch', value: p });
    await db.meta.put({ key: 'lastSearchAt', value: nowISO() });
  };
  return [params, save];
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function useToday(): string {
  return todayISO();
}

/** Convert saved comparisons into per-destination quotes for the ranking engine. */
export function useUserQuotes(profile: Profile): Record<string, UserQuote[]> {
  const comps = useLiveQuery(() => db.comparisons.toArray(), []) ?? [];
  const partners = useLiveQuery(() => db.partners.toArray(), []) ?? [];
  const bonuses = useLiveQuery(() => db.bonuses.toArray(), []) ?? [];
  return useMemo(() => buildQuotes(comps, profile, partners, bonuses), [comps, profile, partners, bonuses]);
}

export function buildQuotes(
  comps: Comparison[],
  profile: Profile,
  partners: Parameters<typeof summarizeComparison>[1]['partners'],
  bonuses: Parameters<typeof summarizeComparison>[1]['bonuses'],
): Record<string, UserQuote[]> {
  const out: Record<string, UserQuote[]> = {};
  const sorted = [...comps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const c of sorted) {
    if (!c.destinationId || c.cashPrice == null) continue;
    const s = summarizeComparison(c, {
      cardId: profile.cardId, balance: profile.points, minAcceptableCpp: profile.minAcceptableCpp, partners, bonuses, verifyWindowDays: profile.bonusVerifyWindowDays,
    });
    const travelers = Math.max(1, c.travelers);
    const best = s.best;
    if (c.kind === 'flight') {
      (out[c.destinationId] ??= []).push({
        kind: 'flight',
        cashPerPerson: c.cashPrice / travelers,
        pointsPerUnit: best?.chasePoints != null ? best.chasePoints / travelers : null,
        feesPerUnit: best ? best.cashOutOfPocket / travelers : 0,
        label: `${c.title} (${c.cashSource || 'your quote'})`,
        verifiedAt: c.cashVerifiedAt,
        awardAvailable: best?.option.availability === 'seen-available',
      });
    } else if (c.departDate && c.returnDate) {
      const nights = Math.max(1, Math.round((Date.parse(c.returnDate) - Date.parse(c.departDate)) / 86400000));
      const rooms = Math.ceil(travelers / 2); // per room-night, matching the ranking engine
      (out[c.destinationId] ??= []).push({
        kind: 'hotel',
        cashPerNight: c.cashPrice / nights / rooms,
        pointsPerUnit: best?.chasePoints != null ? best.chasePoints / nights / rooms : null,
        feesPerUnit: 0,
        label: `${c.title} (${c.cashSource || 'your quote'})`,
        verifiedAt: c.cashVerifiedAt,
        awardAvailable: best?.option.availability === 'seen-available',
      });
    }
  }
  return out;
}
