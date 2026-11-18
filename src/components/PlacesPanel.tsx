import { useState } from 'react';
import { CheckCircle2, Link2, MapPinPlus, Search, Star, Trash2 } from 'lucide-react';
import type { Place, PlaceCategory, Trip } from '../lib/types';
import { db, nowISO, uid } from '../lib/db';
import { useOnline, useProfile } from '../lib/hooks';
import { searchPlaces, simpleHours, type GeoResult } from '../providers/geocode';
import { describeError } from '../providers/http';
import { parseGoogleMapsLink, sanitizeUrl } from '../lib/gmaps';
import { CATEGORIES, catMeta, findDuplicate } from '../lib/places';
import { isValidLatLon } from '../engine/geo';
import { Badge, Button, Chip, ExternalLink, Field, Input, Notice, NumberInput, Select, Tabs, useToast } from './ui';

type Mode = 'search' | 'link' | 'manual';

export function PlacesPanel({
  trip,
  places,
  pickedPoint,
  onRequestPick,
  onFocus,
  onAddToDay,
  dates,
}: {
  trip: Trip;
  places: Place[];
  pickedPoint: [number, number] | null;
  onRequestPick: (on: boolean) => void;
  onFocus: (p: Place) => void;
  onAddToDay: (p: Place, date: string) => void;
  dates: string[];
}) {
  const [mode, setMode] = useState<Mode>('search');
  const [filter, setFilter] = useState<PlaceCategory | 'all' | 'fav'>('all');
  const shown = places.filter((p) => (filter === 'all' ? true : filter === 'fav' ? p.favorite : p.category === filter)).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <Tabs<Mode>
        value={mode}
        onChange={(m) => { setMode(m); onRequestPick(m === 'manual'); }}
        tabs={[
          { id: 'search', label: 'Search' },
          { id: 'link', label: 'Paste Maps link' },
          { id: 'manual', label: 'Add manually' },
        ]}
      />
      {mode === 'search' && <SearchAdd trip={trip} places={places} />}
      {mode === 'link' && <LinkAdd trip={trip} places={places} />}
      {mode === 'manual' && <ManualAdd trip={trip} places={places} picked={pickedPoint} />}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Saved places ({places.length})</h3>
        </div>
        <div className="mb-2 flex flex-wrap gap-1">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All</Chip>
          <Chip active={filter === 'fav'} onClick={() => setFilter('fav')}>★ Favorites</Chip>
          {CATEGORIES.filter((c) => places.some((p) => p.category === c.id)).map((c) => (
            <Chip key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)}>{c.label}</Chip>
          ))}
        </div>
        {places.length === 0 && <p className="text-sm text-slate-500">Nothing saved yet. Search for restaurants, cafes and sights above.</p>}
        <ul className="space-y-2">
          {shown.map((p) => <PlaceRow key={p.id} p={p} onFocus={() => onFocus(p)} dates={dates} onAddToDay={(d) => onAddToDay(p, d)} />)}
        </ul>
      </div>
    </div>
  );
}

async function savePlace(trip: Trip, places: Place[], cand: Omit<Place, 'id' | 'tripId' | 'createdAt' | 'favorite' | 'visited' | 'notes'> & { notes?: string }): Promise<{ ok: boolean; dup?: Place }> {
  const dup = findDuplicate(places, cand);
  if (dup) return { ok: false, dup };
  await db.places.put({ ...cand, id: uid(), tripId: trip.id, createdAt: nowISO(), favorite: false, visited: false, notes: cand.notes ?? '' });
  return { ok: true };
}

function SearchAdd({ trip, places }: { trip: Trip; places: Place[] }) {
  const profile = useProfile();
  const online = useOnline();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [nearOnly, setNearOnly] = useState(true);
  const [results, setResults] = useState<GeoResult[] | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setErr(''); setLoading(true);
    try {
      setResults(await searchPlaces(q, { near: { lat: trip.lat, lon: trip.lon }, bounded: nearOnly, radiusDeg: 0.3, email: profile.nominatimEmail || undefined }));
    } catch (e) {
      setErr(describeError(e)); setResults(null);
    } finally { setLoading(false); }
  };
  return (
    <div className="space-y-2">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) void run(); }}>
        <Input aria-label="Search places or addresses" value={q} maxLength={200} placeholder={`Ramen, museum, or an address in ${trip.city}`} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="primary" loading={loading} disabled={!online || q.trim().length < 2}><Search className="h-4 w-4" /> Search</Button>
      </form>
      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"><input type="checkbox" checked={nearOnly} onChange={(e) => setNearOnly(e.target.checked)} /> Only near {trip.city}</label>
      {!online && <Notice tone="warn" className="text-xs">Search needs a connection. You can still add places manually.</Notice>}
      {err && <Notice tone="error" className="text-xs">{err} You can add the place manually instead.</Notice>}
      {results && results.length === 0 && (
        <Notice tone="warn" className="text-xs">No results. Check the spelling, add the neighborhood or city, untick “Only near”, or add it manually by clicking the map.</Notice>
      )}
      {results && results.length > 0 && (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {results.map((r) => {
            const dup = findDuplicate(places, r);
            return <ResultRow key={r.osmRef} r={r} dup={dup} onSave={async (category) => {
              const hrs = simpleHours(r.openingHours);
              const res = await savePlace(trip, places, { name: r.name, category, lat: r.lat, lon: r.lon, address: r.address, source: r.provider, osmRef: r.osmRef, url: sanitizeUrl(r.website), durationMin: catMeta(category).defaultMin, openTime: hrs?.open, closeTime: hrs?.close, notes: r.openingHours && !hrs ? `OSM hours: ${r.openingHours}` : '' });
              toast(res.ok ? `Saved ${r.name}` : `Already saved as “${res.dup!.name}”`, res.ok ? 'success' : 'info');
            }} />;
          })}
        </ul>
      )}
      <p className="text-[10px] text-slate-500">Search by OpenStreetMap Nominatim (Photon fallback). Results cached for 30 days; requests limited to 1/second per the usage policy.</p>
    </div>
  );
}

function ResultRow({ r, dup, onSave }: { r: GeoResult; dup?: Place; onSave: (c: PlaceCategory) => void }) {
  const [cat, setCat] = useState<PlaceCategory>(r.category);
  return (
    <li className="rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-800">
      <div className="font-medium">{r.name}</div>
      <div className="line-clamp-2 text-slate-500">{r.address}</div>
      {r.openingHours && <div className="text-slate-500">Hours (OSM): {r.openingHours}</div>}
      <div className="mt-1.5 flex items-center gap-2">
        <Select aria-label="Category" className="py-1 text-xs" value={cat} onChange={(e) => setCat(e.target.value as PlaceCategory)}>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
        {dup ? <Badge tone="slate"><CheckCircle2 className="h-3 w-3" /> Saved</Badge> : <Button size="sm" variant="primary" onClick={() => onSave(cat)}>Save</Button>}
      </div>
    </li>
  );
}

function LinkAdd({ trip, places }: { trip: Trip; places: Place[] }) {
  const toast = useToast();
  const profile = useProfile();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [cat, setCat] = useState<PlaceCategory>('restaurant');
  const parsed = url.trim() ? parseGoogleMapsLink(url) : null;
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<GeoResult[] | null>(null);
  const [err, setErr] = useState('');
  return (
    <div className="space-y-2 text-sm">
      <Input aria-label="Google Maps link" value={url} placeholder="https://www.google.com/maps/place/…" onChange={(e) => { setUrl(e.target.value); setResults(null); setName(''); }} />
      {parsed && !parsed.ok && <Notice tone="warn" className="text-xs">{parsed.reason}</Notice>}
      {parsed?.ok && parsed.lat != null && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
          <div className="text-xs text-slate-600 dark:text-slate-400">Coordinates found in link: {parsed.lat.toFixed(5)}, {parsed.lon!.toFixed(5)}</div>
          <Input aria-label="Place name" value={name || parsed.name || ''} placeholder="Place name" onChange={(e) => setName(e.target.value)} />
          <div className="flex gap-2">
            <Select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value as PlaceCategory)}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
            <Button variant="primary" disabled={!(name || parsed.name)} onClick={async () => {
              const res = await savePlace(trip, places, { name: (name || parsed.name)!.trim(), category: cat, lat: parsed.lat!, lon: parsed.lon!, address: '', source: 'gmaps-link', url: sanitizeUrl(url), durationMin: catMeta(cat).defaultMin });
              toast(res.ok ? 'Saved from link' : `Already saved as “${res.dup!.name}”`, res.ok ? 'success' : 'info');
              if (res.ok) setUrl('');
            }}>Save</Button>
          </div>
        </div>
      )}
      {parsed?.ok && parsed.lat == null && parsed.name && (
        <div className="space-y-2">
          <p className="text-xs text-slate-600 dark:text-slate-400">The link has a name (“{parsed.name}”) but no coordinates. Look it up on OpenStreetMap:</p>
          <Button loading={searching} onClick={async () => {
            setSearching(true); setErr('');
            try { setResults(await searchPlaces(parsed.name!, { near: { lat: trip.lat, lon: trip.lon }, radiusDeg: 0.3, email: profile.nominatimEmail || undefined })); }
            catch (e) { setErr(describeError(e)); }
            finally { setSearching(false); }
          }}><Search className="h-4 w-4" /> Find “{parsed.name}”</Button>
          {err && <Notice tone="error" className="text-xs">{err}</Notice>}
          {results?.length === 0 && <Notice tone="warn" className="text-xs">Not found on OpenStreetMap. Add it manually instead.</Notice>}
          <ul className="space-y-1.5">
            {results?.map((r) => (
              <ResultRow key={r.osmRef} r={r} dup={findDuplicate(places, r)} onSave={async (category) => {
                const res = await savePlace(trip, places, { name: r.name, category, lat: r.lat, lon: r.lon, address: r.address, source: r.provider, osmRef: r.osmRef, url: sanitizeUrl(url), durationMin: catMeta(category).defaultMin });
                toast(res.ok ? `Saved ${r.name}` : `Already saved as “${res.dup!.name}”`, res.ok ? 'success' : 'info');
              }} />
            ))}
          </ul>
        </div>
      )}
      <p className="text-[10px] text-slate-500">Works with full google.com/maps URLs. Short share links (maps.app.goo.gl) can't be expanded for free; open them and copy the full URL. The original link is saved for reference.</p>
    </div>
  );
}

function ManualAdd({ trip, places, picked }: { trip: Trip; places: Place[]; picked: [number, number] | null }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [cat, setCat] = useState<PlaceCategory>('custom');
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [lastPick, setLastPick] = useState(picked);
  if (picked !== lastPick) { setLastPick(picked); if (picked) { setLat(Number(picked[0].toFixed(6))); setLon(Number(picked[1].toFixed(6))); } }
  const [refUrl, setRefUrl] = useState('');
  const valid = name.trim().length > 0 && isValidLatLon(lat, lon) && (!refUrl || !!sanitizeUrl(refUrl));
  return (
    <div className="space-y-2">
      <Notice className="text-xs"><MapPinPlus className="mr-1 inline h-3.5 w-3.5" />Click the map to drop the location, or type coordinates.</Notice>
      <Field label="Name" htmlFor="ma-n"><Input id="ma-n" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Category" htmlFor="ma-c"><Select id="ma-c" value={cat} onChange={(e) => setCat(e.target.value as PlaceCategory)}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
        <Field label="Latitude" htmlFor="ma-lat"><NumberInput id="ma-lat" value={lat} allowEmpty min={-90} max={90} onChange={setLat} /></Field>
        <Field label="Longitude" htmlFor="ma-lon"><NumberInput id="ma-lon" value={lon} allowEmpty min={-180} max={180} onChange={setLon} /></Field>
      </div>
      <Field label="Reference URL (optional — e.g. a video or review you saved)" htmlFor="ma-u"><Input id="ma-u" value={refUrl} placeholder="https://…" onChange={(e) => setRefUrl(e.target.value)} /></Field>
      {lat != null && lon != null && !isValidLatLon(lat, lon) && <p className="text-xs text-rose-600">Those coordinates aren't valid.</p>}
      <Button variant="primary" disabled={!valid} onClick={async () => {
        const res = await savePlace(trip, places, { name: name.trim(), category: cat, lat: lat!, lon: lon!, address: '', source: 'manual', url: sanitizeUrl(refUrl), durationMin: catMeta(cat).defaultMin });
        toast(res.ok ? 'Place saved (coordinates entered by you)' : `Already saved as “${res.dup!.name}”`, res.ok ? 'success' : 'info');
        if (res.ok) { setName(''); setRefUrl(''); }
      }}>Save place</Button>
    </div>
  );
}

function PlaceRow({ p, onFocus, dates, onAddToDay }: { p: Place; onFocus: () => void; dates: string[]; onAddToDay: (d: string) => void }) {
  const [open, setOpen] = useState(false);
  const upd = (patch: Partial<Place>) => db.places.update(p.id, patch);
  const meta = catMeta(p.category);
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-2.5 text-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-2">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: meta.color }} aria-hidden />
        <button className="min-w-0 flex-1 text-left" onClick={onFocus}>
          <div className={`truncate font-medium ${p.visited ? 'text-slate-400 line-through' : ''}`}>{p.name}</div>
          <div className="text-[11px] text-slate-500">{meta.label}{p.source === 'manual' ? ' · coordinates entered by you' : p.source === 'gmaps-link' ? ' · from Google Maps link' : ' · OpenStreetMap'}</div>
        </button>
        <button aria-label={p.favorite ? 'Unfavorite' : 'Favorite'} onClick={() => upd({ favorite: !p.favorite })} className="p-1"><Star className={`h-4 w-4 ${p.favorite ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} /></button>
        <button aria-label={p.visited ? 'Mark not visited' : 'Mark visited'} onClick={() => upd({ visited: !p.visited })} className="p-1"><CheckCircle2 className={`h-4 w-4 ${p.visited ? 'text-emerald-600' : 'text-slate-400'}`} /></button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Select aria-label="Add to day" className="w-auto py-1 text-xs" value="" onChange={(e) => e.target.value && onAddToDay(e.target.value)}>
          <option value="">+ Add to day…</option>
          {dates.map((d, i) => <option key={d} value={d}>Day {i + 1} · {new Date(d + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</option>)}
        </Select>
        <button className="text-xs text-brand-700 dark:text-brand-300" onClick={() => setOpen((o) => !o)}>{open ? 'Less' : 'Details'}</button>
        {p.url && <ExternalLink href={p.url} className="text-xs"><Link2 className="h-3 w-3" /> Link</ExternalLink>}
      </div>
      {open && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Field label="Category" htmlFor={`c-${p.id}`}><Select id={`c-${p.id}`} className="py-1 text-xs" value={p.category} onChange={(e) => upd({ category: e.target.value as PlaceCategory })}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
          <Field label="Visit length (min)" htmlFor={`d-${p.id}`}><NumberInput id={`d-${p.id}`} className="py-1 text-xs" value={p.durationMin} min={5} max={720} step={1} onChange={(v) => upd({ durationMin: v ?? 60 })} /></Field>
          <Field label="Opens" htmlFor={`o-${p.id}`}><Input id={`o-${p.id}`} type="time" className="py-1 text-xs" value={p.openTime ?? ''} onChange={(e) => upd({ openTime: e.target.value || undefined })} /></Field>
          <Field label="Closes" htmlFor={`cl-${p.id}`}><Input id={`cl-${p.id}`} type="time" className="py-1 text-xs" value={p.closeTime ?? ''} onChange={(e) => upd({ closeTime: e.target.value || undefined })} /></Field>
          <Field label="Reference URL" htmlFor={`u-${p.id}`} className="sm:col-span-2"><Input id={`u-${p.id}`} className="py-1 text-xs" defaultValue={p.url ?? ''} onBlur={(e) => upd({ url: sanitizeUrl(e.target.value) })} /></Field>
          <Field label="Notes" htmlFor={`n-${p.id}`} className="sm:col-span-2"><Input id={`n-${p.id}`} className="py-1 text-xs" defaultValue={p.notes} maxLength={1000} onBlur={(e) => upd({ notes: e.target.value })} /></Field>
          {p.address && <p className="text-[11px] text-slate-500 sm:col-span-2">{p.address}</p>}
          <div className="sm:col-span-2">
            <Button size="sm" variant="ghost" onClick={async () => { if (confirm(`Remove ${p.name}? It will also be removed from your itinerary.`)) { await db.itinerary.where('tripId').equals(p.tripId).filter((i) => i.placeId === p.id).delete(); await db.places.delete(p.id); } }}><Trash2 className="h-3.5 w-3.5" /> Remove place</Button>
          </div>
        </div>
      )}
    </li>
  );
}
