import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookmarkPlus, CloudSun, SlidersHorizontal } from 'lucide-react';
import { SearchForm } from '../components/SearchForm';
import { DestinationCard } from '../components/DestinationCard';
import { DestinationDetail } from '../components/DestinationDetail';
import { Badge, Button, Card, Field, Input, Modal, Notice, PageHeader, Select, Spinner, useToast } from '../components/ui';
import { useLastSearch, useProfile } from '../lib/hooks';
import { useRanking } from '../lib/useRanking';
import { PRESET_LABELS, PRESET_WEIGHTS, monthName, type TripEstimate } from '../engine/ranking';
import type { PriorityPreset, ScoreWeights, SearchParams } from '../lib/types';
import { db, nowISO, uid } from '../lib/db';
import { toggleSavedDestination } from '../lib/actions';
import { pts, usd } from '../lib/format';

const WEIGHT_LABELS: Record<keyof ScoreWeights, string> = {
  pointsValue: 'Points value',
  affordability: 'Cash affordability',
  convenience: 'Convenience',
  experiences: 'Experiences',
  weather: 'Weather',
  preference: 'Preference match',
};

export function Explore() {
  const profile = useProfile();
  const [saved, save] = useLastSearch(profile);
  const [draft, setDraft] = useState<SearchParams>(saved);
  const [active, setActive] = useState<SearchParams>(saved);
  const [lastSavedRef, setLastSavedRef] = useState(saved);
  if (saved !== lastSavedRef) {
    // stored params finished loading (or changed elsewhere)
    setLastSavedRef(saved);
    setDraft(saved);
    setActive(saved);
  }
  const { result, weather } = useRanking(active, profile);
  const [open, setOpen] = useState<TripEstimate | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [searchName, setSearchName] = useState('');
  const savedDest = useLiveQuery(() => db.savedDestinations.toArray(), []) ?? [];
  const savedIds = useMemo(() => new Set(savedDest.map((s) => s.id)), [savedDest]);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [qs, setQs] = useSearchParams();
  const toast = useToast();

  useEffect(() => {
    const id = qs.get('dest');
    if (id) {
      const t = result.results.find((r) => r.destination.id === id);
      if (t) setOpen(t);
    }
  }, [qs, result.results]);

  const runSearch = async () => {
    setActive(draft);
    await save(draft);
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const setPriority = (p: PriorityPreset) => {
    const next = { ...active, priority: p, weights: p === 'custom' ? active.weights : { ...PRESET_WEIGHTS[p] } };
    setActive(next);
    setDraft(next);
    void save(next);
  };
  const setWeight = (k: keyof ScoreWeights, v: number) => {
    const next = { ...active, priority: 'custom' as const, weights: { ...active.weights, [k]: v } };
    setActive(next);
    setDraft(next);
    void save(next);
  };

  const toggleSave = async (id: string) => {
    const on = await toggleSavedDestination(id);
    toast(on ? 'Destination saved' : 'Removed from saved destinations', on ? 'success' : 'info');
  };

  return (
    <div>
      <PageHeader
        title="Where can my Chase points take me?"
        subtitle="Search without a destination. PointPilot ranks places by what you'd actually pay and how well your points cover it, using clearly labeled estimates until you record real quotes."
      />
      <Card>
        <SearchForm value={draft} onChange={setDraft} onSubmit={runSearch} />
      </Card>

      <div ref={resultsRef} className="scroll-mt-20" />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {result.results.length} destinations for {pts(active.points)} points · {monthName(active.month)} {active.year} · {active.minDays}–{active.maxDays} days · ≤{usd(active.maxCash)}
          </h2>
          <p className="text-xs text-slate-500">
            From {active.airports.map((a) => a.code).join(' / ')} · {active.travelers} traveler{active.travelers > 1 ? 's' : ''} · {active.cabin}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={active.priority} onChange={(e) => setPriority(e.target.value as PriorityPreset)} aria-label="Ranking priority" className="w-56">
            {(Object.keys(PRESET_LABELS) as PriorityPreset[]).map((p) => (
              <option key={p} value={p}>
                {PRESET_LABELS[p]}
              </option>
            ))}
          </Select>
          <Button onClick={() => setSaveOpen(true)}>
            <BookmarkPlus className="h-4 w-4" /> Save search
          </Button>
        </div>
      </div>

      <details className="mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900" open={active.priority === 'custom'}>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="h-4 w-4" /> Customize ranking weights
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(Object.keys(WEIGHT_LABELS) as (keyof ScoreWeights)[]).map((k) => (
            <label key={k} className="text-xs">
              <span className="flex justify-between">
                {WEIGHT_LABELS[k]} <span className="tabular font-semibold">{(active.priority === 'custom' ? active.weights : PRESET_WEIGHTS[active.priority])[k]}</span>
              </span>
              <input
                type="range"
                min={0}
                max={60}
                value={(active.priority === 'custom' ? active.weights : PRESET_WEIGHTS[active.priority])[k]}
                onChange={(e) => setWeight(k, Number(e.target.value))}
                className="w-full accent-brand-600"
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Safety advisories, budget overruns and missing points are applied on top as penalties.</p>
      </details>

      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <CloudSun className="h-4 w-4" />
          {weather.loading ? (
            <Spinner label={`Loading observed ${monthName(active.month)} weather from Open-Meteo… (${weather.ok}/${result.results.length + result.hidden.length})`} />
          ) : (
            <span>
              Historical weather for {weather.ok} destinations (Open-Meteo, cached).{weather.failed ? ` ${weather.failed} unavailable — using general climate guidance for those${weather.rateLimited ? ' (free per-minute limit reached; retrying automatically in about a minute)' : ''}.` : ''}
            </span>
          )}
        </div>
        {result.notes.map((n) => (
          <Notice key={n} className="text-xs">
            {n}
          </Notice>
        ))}
      </div>

      <h2 className="mt-8 mb-3 text-lg font-semibold">Top picks by category</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result.categories.map((c) =>
          c.pick ? (
            <div key={c.id}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">{c.title}</div>
              <DestinationCard t={c.pick} onOpen={() => setOpen(c.pick)} saved={savedIds.has(c.pick.destination.id)} onToggleSave={() => toggleSave(c.pick!.destination.id)} />
              <p className="mt-1 text-[11px] text-slate-500">{c.why}</p>
            </div>
          ) : (
            <div key={c.id} className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm dark:border-slate-700">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{c.title}</div>
              No destination fits this category with your current points, budget and filters.
            </div>
          ),
        )}
      </div>

      <h2 className="mt-10 mb-3 text-lg font-semibold">Full ranking</h2>
      {result.results.length === 0 ? (
        <Notice tone="warn">No destinations match. Loosen the filters (scope, max flight time, exclusions).</Notice>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {result.results.map((t, i) => (
            <DestinationCard key={t.destination.id} t={t} rank={i + 1} onOpen={() => setOpen(t)} saved={savedIds.has(t.destination.id)} onToggleSave={() => toggleSave(t.destination.id)} />
          ))}
        </div>
      )}
      {result.hidden.length > 0 && (
        <div className="mt-4">
          <button className="text-sm text-brand-700 dark:text-brand-300" onClick={() => setShowHidden((s) => !s)}>
            {showHidden ? 'Hide' : 'Show'} {result.hidden.length} filtered-out destinations
          </button>
          {showHidden && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {result.hidden.map((h) => (
                <Badge key={h.destination.id}>
                  {h.destination.name}: {h.reason}
                </Badge>
              ))}
            </ul>
          )}
        </div>
      )}

      <DestinationDetail
        t={open}
        params={active}
        profile={profile}
        onClose={() => {
          setOpen(null);
          if (qs.get('dest')) setQs({}, { replace: true });
        }}
        saved={!!open && savedIds.has(open.destination.id)}
        onToggleSave={() => open && toggleSave(open.destination.id)}
      />

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Save this search">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await db.savedSearches.put({ id: uid(), name: searchName.trim() || `${monthName(active.month)} ${active.year} · ${pts(active.points)} pts`, params: active, createdAt: nowISO() });
            setSaveOpen(false);
            setSearchName('');
            toast('Search saved', 'success');
          }}
          className="space-y-3"
        >
          <Field label="Name" htmlFor="ss-name">
            <Input id="ss-name" value={searchName} maxLength={80} placeholder={`${monthName(active.month)} ${active.year} · ${pts(active.points)} pts`} onChange={(e) => setSearchName(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary">
            Save
          </Button>
        </form>
      </Modal>
    </div>
  );
}
