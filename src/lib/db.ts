import Dexie, { type Table } from 'dexie';
import type {
  CacheEntry,
  Comparison,
  Expense,
  FlexPriceEntry,
  ItineraryItem,
  Place,
  Profile,
  SavedDestination,
  SavedSearch,
  SearchParams,
  Trip,
  TransferBonus,
  TransferPartner,
} from './types';
import { SEED_BONUSES, SEED_PARTNERS } from '../data/partners';
import { PRESET_WEIGHTS } from '../engine/ranking';

/**
 * Local-first storage in IndexedDB (via Dexie). Nothing leaves the browser unless the
 * user exports it. Clearing site data or switching devices loses it — hence Export/Import.
 */
export class PointPilotDB extends Dexie {
  profile!: Table<Profile, string>;
  partners!: Table<TransferPartner, string>;
  bonuses!: Table<TransferBonus, string>;
  comparisons!: Table<Comparison, string>;
  flexPrices!: Table<FlexPriceEntry, string>;
  savedSearches!: Table<SavedSearch, string>;
  savedDestinations!: Table<SavedDestination, string>;
  trips!: Table<Trip, string>;
  places!: Table<Place, string>;
  itinerary!: Table<ItineraryItem, string>;
  expenses!: Table<Expense, string>;
  cache!: Table<CacheEntry, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor(name = 'pointpilot') {
    super(name);
    this.version(1).stores({
      profile: 'id',
      partners: 'id, type',
      bonuses: 'id, partnerId, endDate',
      comparisons: 'id, destinationId, tripId, updatedAt',
      flexPrices: 'id, destinationId, departDate',
      savedSearches: 'id, createdAt',
      savedDestinations: 'id, createdAt',
      trips: 'id, startDate, updatedAt',
      places: 'id, tripId, category, [tripId+osmRef]',
      itinerary: 'id, tripId, date, [tripId+date]',
      expenses: 'id, tripId, date',
      cache: 'key, fetchedAt',
      meta: 'key',
    });
  }
}

export const db = new PointPilotDB();

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export const nowISO = () => new Date().toISOString();

export function defaultProfile(): Profile {
  return {
    id: 'profile',
    points: 100000,
    cardId: 'csp',
    airports: [
      { code: 'SAN', groundCost: 0, groundHours: 0, isHome: true },
      { code: 'LAX', groundCost: 90, groundHours: 2.5, isHome: false },
    ],
    travelers: 1,
    cabin: 'economy',
    minAcceptableCpp: 1.25,
    pointsBoostCpp: 1.5,
    legacyPoints: 0,
    homeCurrency: 'USD',
    styles: [],
    nominatimEmail: '',
    bonusVerifyWindowDays: 7,
    updatedAt: nowISO(),
  };
}

export function nextMonthDefault(today = new Date()): { month: number; year: number } {
  // default to April of the next upcoming April (matches the acceptance scenario)
  const y = today.getMonth() + 1 > 4 ? today.getFullYear() + 1 : today.getFullYear();
  return { month: 4, year: y };
}

export function defaultSearch(p: Profile): SearchParams {
  const { month, year } = nextMonthDefault();
  return {
    points: p.points,
    cardId: p.cardId,
    airports: p.airports,
    month,
    year,
    dateMode: 'month',
    departDates: [],
    returnDates: [],
    minDays: 5,
    maxDays: 8,
    travelers: p.travelers,
    cabin: p.cabin,
    maxCash: 1000,
    maxPoints: p.points,
    scope: 'both',
    preferred: [],
    excluded: [],
    maxLayovers: null,
    maxFlightHours: null,
    styles: p.styles,
    priority: 'balanced',
    weights: { ...PRESET_WEIGHTS.balanced },
  };
}

/** Seed partners/bonuses once; never overwrite user edits. */
export async function ensureSeeded(database: PointPilotDB = db): Promise<void> {
  await database.transaction('rw', database.profile, database.partners, database.bonuses, database.meta, async () => {
    if (!(await database.profile.get('profile'))) await database.profile.put(defaultProfile());
    const seededVersion = (await database.meta.get('seedVersion'))?.value as string | undefined;
    const SEED_VERSION = '2026-11-18';
    if (seededVersion !== SEED_VERSION) {
      for (const p of SEED_PARTNERS) if (!(await database.partners.get(p.id))) await database.partners.put(p);
      for (const b of SEED_BONUSES) if (!(await database.bonuses.get(b.id))) await database.bonuses.put(b);
      await database.meta.put({ key: 'seedVersion', value: SEED_VERSION });
    }
  });
}

export async function getProfile(): Promise<Profile> {
  return (await db.profile.get('profile')) ?? defaultProfile();
}

export async function updateProfile(patch: Partial<Profile>): Promise<void> {
  const cur = await getProfile();
  await db.profile.put({ ...cur, ...patch, id: 'profile', updatedAt: nowISO() });
}

// ------------------------------------------------------------- cache helpers

export async function cacheGet<T>(key: string, maxAgeMs: number): Promise<{ value: T; fetchedAt: string } | null> {
  try {
    const e = await db.cache.get(key);
    if (!e) return null;
    if (Date.now() - Date.parse(e.fetchedAt) > maxAgeMs) return null;
    return { value: e.value as T, fetchedAt: e.fetchedAt };
  } catch {
    return null;
  }
}

export async function cacheGetStale<T>(key: string): Promise<{ value: T; fetchedAt: string } | null> {
  try {
    const e = await db.cache.get(key);
    return e ? { value: e.value as T, fetchedAt: e.fetchedAt } : null;
  } catch {
    return null;
  }
}

export async function cachePut(key: string, value: unknown): Promise<void> {
  try {
    await db.cache.put({ key, value, fetchedAt: nowISO() });
  } catch {
    /* storage full or blocked — caching is best effort */
  }
}

// ------------------------------------------------------------- export/import

const EXPORT_TABLES = [
  'profile', 'partners', 'bonuses', 'comparisons', 'flexPrices', 'savedSearches', 'savedDestinations', 'trips', 'places', 'itinerary', 'expenses',
] as const;
type ExportTable = (typeof EXPORT_TABLES)[number];

export interface ExportFile {
  app: 'PointPilot';
  version: 1;
  exportedAt: string;
  data: Partial<Record<ExportTable, unknown[]>>;
}

export async function exportAll(database: PointPilotDB = db, tripId?: string): Promise<ExportFile> {
  const data: ExportFile['data'] = {};
  for (const t of EXPORT_TABLES) {
    let rows = await (database[t] as Table<{ tripId?: string; id: string }, string>).toArray();
    if (tripId) {
      if (t === 'trips') rows = rows.filter((r) => r.id === tripId);
      else if (['places', 'itinerary', 'expenses'].includes(t)) rows = rows.filter((r) => r.tripId === tripId);
      else if (t === 'comparisons') rows = rows.filter((r) => r.tripId === tripId);
      else continue;
    }
    data[t] = rows;
  }
  return { app: 'PointPilot', version: 1, exportedAt: nowISO(), data };
}

export interface ImportReport {
  imported: Record<string, number>;
  skipped: string[];
}

/** Validates the file shape and merges rows by id (existing rows with the same id are replaced). */
export async function importAll(file: unknown, database: PointPilotDB = db): Promise<ImportReport> {
  if (!file || typeof file !== 'object') throw new Error('Not a PointPilot export file.');
  const f = file as Partial<ExportFile>;
  if (f.app !== 'PointPilot' || f.version !== 1 || !f.data || typeof f.data !== 'object') {
    throw new Error('Not a PointPilot export file (missing app/version header).');
  }
  const report: ImportReport = { imported: {}, skipped: [] };
  await database.transaction('rw', EXPORT_TABLES.map((t) => database[t]), async () => {
    for (const t of EXPORT_TABLES) {
      const rows = f.data![t];
      if (rows === undefined) continue;
      if (!Array.isArray(rows)) { report.skipped.push(`${t}: not a list`); continue; }
      const valid = rows.filter((r): r is { id: string } => !!r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string');
      if (valid.length !== rows.length) report.skipped.push(`${t}: ${rows.length - valid.length} invalid rows`);
      await (database[t] as Table<{ id: string }, string>).bulkPut(valid);
      report.imported[t] = valid.length;
    }
  });
  return report;
}

export function downloadJSON(obj: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return null;
}
