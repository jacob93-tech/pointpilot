import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, CalendarDays, Download, Luggage, Map, MapPin, Plus, Trash2, Wallet } from 'lucide-react';
import { db, downloadJSON, exportAll, nowISO } from '../lib/db';
import { useProfile, useToday } from '../lib/hooks';
import type { Trip, TravelMode } from '../lib/types';
import { createBlankTrip, deleteTrip } from '../lib/actions';
import { DESTINATIONS, getDestination } from '../data/destinations';
import { summarizeBudget, tripDays } from '../engine/budget';
import { searchPlaces, type GeoResult } from '../providers/geocode';
import { describeError } from '../providers/http';
import { fmtDate, pts, usd } from '../lib/format';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Notice, NumberInput, PageHeader, Select, Spinner, Stat, TextArea, useToast } from '../components/ui';
import { DestinationImage } from '../components/DestinationCard';
import { addDays } from '../engine/flexDates';

export function Trips() {
  const { tripId } = useParams();
  return tripId ? <TripDetail id={tripId} /> : <TripList />;
}

function TripList() {
  const trips = useLiveQuery(() => db.trips.orderBy('startDate').toArray(), []);
  const places = useLiveQuery(() => db.places.toArray(), []) ?? [];
  const [creating, setCreating] = useState(false);
  const today = useToday();
  if (!trips) return null;
  const upcoming = trips.filter((t) => !t.endDate || t.endDate >= today);
  const past = trips.filter((t) => t.endDate && t.endDate < today);
  return (
    <div>
      <PageHeader title="My Trips" subtitle="Saved trips live in this browser (IndexedDB). Export them from a trip or from Settings to keep a backup." action={<Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New trip</Button>} />
      {trips.length === 0 ? (
        <EmptyState icon={<Luggage className="h-7 w-7" />} title="No trips yet" action={<div className="flex gap-2"><Link to="/explore"><Button variant="primary">Explore destinations</Button></Link><Button onClick={() => setCreating(true)}>Create a blank trip</Button></div>}>
          Pick a destination in Explore and choose “Save as a new trip”, or start a blank trip for anywhere.
        </EmptyState>
      ) : (
        <>
          {[['Upcoming', upcoming], ['Past', past]].map(([label, list]) =>
            (list as Trip[]).length ? (
              <section key={label as string} className="mb-8">
                <h2 className="mb-3 text-lg font-semibold">{label as string}</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(list as Trip[]).map((t) => {
                    const d = getDestination(t.destinationId);
                    return (
                      <Link key={t.id} to={`/trips/${t.id}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
                        {d ? <DestinationImage title={d.wikiTitle} alt={d.name} className="h-28 w-full" /> : <div className="h-28 bg-gradient-to-br from-slate-500 to-slate-700" />}
                        <div className="p-3">
                          <div className="font-semibold">{t.name}</div>
                          <div className="text-xs text-slate-500">{fmtDate(t.startDate)} – {fmtDate(t.endDate)} · {tripDays(t)} days</div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            <Badge>{places.filter((p) => p.tripId === t.id).length} places</Badge>
                            <Badge>Budget {usd(t.cashBudget)}</Badge>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null,
          )}
        </>
      )}
      <NewTripModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function NewTripModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const profile = useProfile();
  const today = useToday();
  const [name, setName] = useState('');
  const [destId, setDestId] = useState('');
  const [cityQuery, setCityQuery] = useState('');
  const [geo, setGeo] = useState<GeoResult | null>(null);
  const [results, setResults] = useState<GeoResult[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [start, setStart] = useState(addDays(today, 30));
  const [end, setEnd] = useState(addDays(today, 36));
  const d = getDestination(destId);
  const location = d ? { city: d.name, lat: d.lat, lon: d.lon } : geo ? { city: geo.name, lat: geo.lat, lon: geo.lon } : null;
  const valid = !!location && !!start && !!end && end >= start;
  return (
    <Modal open={open} onClose={onClose} title="New trip">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || !location) return;
          const id = await createBlankTrip(name.trim() || `${location.city} trip`, location.city, location.lat, location.lon, start, end);
          if (d) await db.trips.update(id, { destinationId: d.id, travelers: profile.travelers });
          onClose();
          nav(`/trips/${id}`);
        }}
      >
        <Field label="Trip name" htmlFor="nt-n"><Input id="nt-n" value={name} maxLength={80} placeholder="Spring in Tokyo" onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Destination from the catalog" htmlFor="nt-d">
          <Select id="nt-d" value={destId} onChange={(e) => { setDestId(e.target.value); setGeo(null); }}>
            <option value="">— or search any city below —</option>
            {DESTINATIONS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        {!destId && (
          <div>
            <Field label="Search a city (OpenStreetMap Nominatim)" htmlFor="nt-c">
              <div className="flex gap-2">
                <Input id="nt-c" value={cityQuery} onChange={(e) => setCityQuery(e.target.value)} placeholder="e.g. Lisbon, Portugal" />
                <Button type="button" loading={loading} onClick={async () => {
                  setErr(''); setLoading(true);
                  try { setResults((await searchPlaces(cityQuery, { limit: 5, email: profile.nominatimEmail || undefined })).slice(0, 5)); }
                  catch (e) { setErr(describeError(e)); }
                  finally { setLoading(false); }
                }}>Search</Button>
              </div>
            </Field>
            {err && <p className="mt-1 text-sm text-rose-600">{err}</p>}
            <ul className="mt-2 space-y-1">
              {results.map((r) => (
                <li key={r.osmRef}>
                  <button type="button" onClick={() => setGeo(r)} className={`w-full rounded-lg border px-3 py-1.5 text-left text-xs ${geo?.osmRef === r.osmRef ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 dark:border-slate-700'}`}>
                    <b>{r.name}</b> — {r.address}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start" htmlFor="nt-s"><Input id="nt-s" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="End" htmlFor="nt-e"><Input id="nt-e" type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        {end < start && <p className="text-sm text-rose-600">End date is before the start date.</p>}
        <Button type="submit" variant="primary" disabled={!valid}>Create trip</Button>
      </form>
    </Modal>
  );
}

function TripDetail({ id }: { id: string }) {
  // undefined = still loading, null = not found
  const trip = useLiveQuery(async () => (await db.trips.get(id)) ?? null, [id]);
  const places = useLiveQuery(() => db.places.where('tripId').equals(id).toArray(), [id]) ?? [];
  const items = useLiveQuery(() => db.itinerary.where('tripId').equals(id).toArray(), [id]) ?? [];
  const expenses = useLiveQuery(() => db.expenses.where('tripId').equals(id).toArray(), [id]) ?? [];
  const comps = useLiveQuery(() => db.comparisons.toArray(), []) ?? [];
  const profile = useProfile();
  const today = useToday();
  const nav = useNavigate();
  const toast = useToast();
  if (trip === undefined) return <Spinner label="Loading trip…" />;
  if (trip === null) return <Notice tone="warn" title="Trip not found">It may have been deleted. <Link to="/trips" className="underline">Back to trips</Link></Notice>;
  const d = getDestination(trip.destinationId);
  const upd = (patch: Partial<Trip>) => db.trips.update(id, { ...patch, updatedAt: nowISO() });
  const budget = summarizeBudget(trip, expenses, profile.points, today);
  const days = tripDays(trip);
  const linked = comps.filter((c) => c.tripId === id || (trip.destinationId && c.destinationId === trip.destinationId));

  return (
    <div className="space-y-5">
      <Link to="/trips" className="inline-flex items-center gap-1 text-sm text-brand-700 dark:text-brand-300"><ArrowLeft className="h-4 w-4" /> All trips</Link>
      <div className="overflow-hidden rounded-2xl">
        {d ? <DestinationImage title={d.wikiTitle} alt={d.name} className="h-40 w-full sm:h-56" /> : <div className="h-24 bg-gradient-to-br from-slate-500 to-slate-700" />}
      </div>
      <PageHeader
        title={trip.name}
        subtitle={`${trip.city} · ${fmtDate(trip.startDate)} – ${fmtDate(trip.endDate)} · ${days} days · last saved ${fmtDate(trip.updatedAt)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link to={`/itinerary?trip=${id}`}><Button variant="primary"><Map className="h-4 w-4" /> Map & itinerary</Button></Link>
            <Link to={`/budget?trip=${id}`}><Button><Wallet className="h-4 w-4" /> Budget</Button></Link>
            <Button onClick={async () => { downloadJSON(await exportAll(undefined, id), `pointpilot-trip-${trip.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`); toast('Trip exported', 'success'); }}><Download className="h-4 w-4" /> Export</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Card><Stat label="Saved places" value={places.length} sub={`${places.filter((p) => p.favorite).length} favorites · ${places.filter((p) => p.visited).length} visited`} /></Card>
        <Card><Stat label="Itinerary" value={`${new Set(items.map((i) => i.date)).size}/${days} days planned`} sub={`${items.length} activities`} /></Card>
        <Card><Stat label="Cash spent / budget" value={`${usd(budget.actualTotal)} / ${usd(trip.cashBudget)}`} sub={`${usd(budget.estimatedTotal)} estimated`} /></Card>
        <Card><Stat label="Points planned" value={pts(trip.pointsBudget)} sub={`${pts(budget.pointsUsed)} recorded as used`} /></Card>
      </div>

      <Card title="Trip details">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Name" htmlFor="td-n"><Input id="td-n" defaultValue={trip.name} maxLength={80} onBlur={(e) => e.target.value.trim() && upd({ name: e.target.value.trim() })} /></Field>
          <Field label="Start" htmlFor="td-s"><Input id="td-s" type="date" value={trip.startDate} onChange={(e) => e.target.value && e.target.value <= trip.endDate && upd({ startDate: e.target.value })} /></Field>
          <Field label="End" htmlFor="td-e"><Input id="td-e" type="date" min={trip.startDate} value={trip.endDate} onChange={(e) => e.target.value && e.target.value >= trip.startDate && upd({ endDate: e.target.value })} /></Field>
          <Field label="Travelers" htmlFor="td-t"><NumberInput id="td-t" value={trip.travelers} min={1} max={20} step={1} onChange={(v) => upd({ travelers: v ?? 1 })} /></Field>
          <Field label="Cash budget (USD)" htmlFor="td-b"><NumberInput id="td-b" value={trip.cashBudget} min={0} max={10_000_000} onChange={(v) => upd({ cashBudget: v ?? 0 })} /></Field>
          <Field label="Points budget" htmlFor="td-p"><NumberInput id="td-p" value={trip.pointsBudget} min={0} max={50_000_000} step={1} onChange={(v) => upd({ pointsBudget: v ?? 0 })} /></Field>
          <Field label="Day starts / ends" htmlFor="td-ds">
            <div className="flex gap-2">
              <Input id="td-ds" type="time" value={trip.dayStart} onChange={(e) => e.target.value && upd({ dayStart: e.target.value })} />
              <Input aria-label="Day end" type="time" value={trip.dayEnd} onChange={(e) => e.target.value && upd({ dayEnd: e.target.value })} />
            </div>
          </Field>
          <Field label="Getting around" htmlFor="td-m">
            <Select id="td-m" value={trip.travelMode} onChange={(e) => upd({ travelMode: e.target.value as TravelMode })}>
              <option value="foot">Walking</option>
              <option value="driving">Driving</option>
              <option value="bike">Cycling</option>
            </Select>
          </Field>
        </div>
        <Field label="Notes" htmlFor="td-notes" className="mt-3"><TextArea id="td-notes" defaultValue={trip.notes} maxLength={5000} onBlur={(e) => upd({ notes: e.target.value })} /></Field>
      </Card>

      <Card title="Places" action={<Link to={`/itinerary?trip=${id}`} className="text-sm text-brand-700 dark:text-brand-300">Add & manage on the map</Link>}>
        {places.length === 0 ? <p className="text-sm text-slate-500">No places yet. Search restaurants and attractions on the map page.</p> : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {places.map((p) => (
              <li key={p.id} className="flex items-start gap-2 rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800/50">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.favorite ? '★ ' : ''}{p.name}</div>
                  <div className="text-[11px] capitalize text-slate-500">{p.category}{p.visited ? ' · visited' : ''}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {linked.length > 0 && (
        <Card title="Related flight & hotel comparisons">
          <ul className="space-y-1 text-sm">
            {linked.map((c) => <li key={c.id}><Link className="text-brand-700 hover:underline dark:text-brand-300" to={`/flights?tab=compare&id=${c.id}`}>{c.title}</Link></li>)}
          </ul>
        </Card>
      )}

      <div className="flex justify-between">
        <Link to={`/itinerary?trip=${id}`} className="inline-flex items-center gap-1 text-sm text-brand-700 dark:text-brand-300"><CalendarDays className="h-4 w-4" /> Plan day by day</Link>
        <Button variant="danger" onClick={async () => { if (confirm(`Delete “${trip.name}” with its places, itinerary and expenses? This can't be undone (export first if unsure).`)) { await deleteTrip(id); nav('/trips'); } }}>
          <Trash2 className="h-4 w-4" /> Delete trip
        </Button>
      </div>
    </div>
  );
}
