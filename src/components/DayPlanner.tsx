import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Lock, LockOpen, Navigation, Plus, Route, Sparkles, Trash2 } from 'lucide-react';
import type { ItineraryItem, Place, Trip } from '../lib/types';
import { db, uid } from '../lib/db';
import { hhmmToMin, minToHHMM, optimizeDay, proxyMatrix, type OptStop } from '../engine/optimize';
import { scheduleItems } from '../engine/schedule';
import { durationMatrix, route as fetchRoute } from '../providers/routing';
import { describeError } from '../providers/http';
import { directionsLink } from '../lib/links';
import { catMeta } from '../lib/places';
import { Badge, Button, ExternalLink, Input, Notice, NumberInput, Select, useToast } from './ui';

export interface DayRoute {
  key: string;
  geometry: [number, number][];
  legsSec: number[];
  routedIds: string[];
  provider: string;
}

export function routeKey(trip: Trip, ids: string[]) {
  return `${trip.travelMode}|${trip.startPlaceId ?? ''}|${ids.join(',')}`;
}

export function DayPlanner({
  trip,
  date,
  dayIndex,
  items,
  places,
  routeState,
  setRoute,
}: {
  trip: Trip;
  date: string;
  dayIndex: number;
  items: ItineraryItem[];
  places: Place[];
  routeState: DayRoute | null;
  setRoute: (r: DayRoute | null) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<'opt' | 'route' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'info' | 'warn' | 'error' | 'success'; text: string } | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newPlace, setNewPlace] = useState('');
  const placeOf = (i: ItineraryItem) => (i.placeId ? places.find((p) => p.id === i.placeId) : undefined);
  const sorted = useMemo(() => [...items].sort((a, b) => a.order - b.order), [items]);
  const located = sorted.filter((i) => placeOf(i));
  const startPlace = trip.startPlaceId ? places.find((p) => p.id === trip.startPlaceId) : undefined;
  const key = routeKey(trip, located.map((i) => i.id));
  const fresh = routeState && routeState.key === key ? routeState : null;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const persistOrder = async (list: ItineraryItem[]) => {
    await db.itinerary.bulkPut(list.map((it, idx) => ({ ...it, order: idx })));
  };

  // travel minutes before each item, from a FRESH route only (never straight-line guesses)
  const travelBefore = (it: ItineraryItem): number | null => {
    if (!fresh) return null;
    const r = fresh.routedIds.indexOf(it.id);
    if (r <= 0) return null;
    return fresh.legsSec[r - 1] / 60;
  };
  const sched = scheduleItems(
    sorted.map((it) => {
      const p = placeOf(it);
      return { id: it.id, durationMin: it.durationMin, locked: it.locked, fixedStartMin: hhmmToMin(it.fixedStart), openMin: hhmmToMin(p?.openTime), closeMin: hhmmToMin(p?.closeTime), travelMin: travelBefore(it) };
    }),
    hhmmToMin(trip.dayStart) ?? 540,
    hhmmToMin(trip.dayEnd) ?? 1260,
  );

  const optimize = async () => {
    setBusy('opt');
    setMsg(null);
    try {
      const unlocated = sorted.filter((i) => !placeOf(i));
      if (located.length < 2) { setMsg({ tone: 'info', text: 'Add at least two activities with map locations to optimize.' }); return; }
      if (located.some((i) => i.locked && !i.fixedStart)) { setMsg({ tone: 'warn', text: 'A locked activity has no start time — set one or unlock it.' }); return; }
      const pts = [...(startPlace ? [startPlace] : []), ...located.map((i) => placeOf(i)!)];
      let matrix: number[][];
      let known = true;
      try {
        matrix = await durationMatrix(pts, trip.travelMode);
      } catch (e) {
        known = false;
        matrix = proxyMatrix(pts, trip.travelMode === 'foot' ? 1.3 : trip.travelMode === 'bike' ? 4 : 8);
        setMsg({ tone: 'warn', text: `Routing service unavailable (${describeError(e)}). Ordered by straight-line distance only — no travel times are shown, and real routes may differ.` });
      }
      let mealIdx = 0;
      const stops: OptStop[] = located.map((i) => {
        const p = placeOf(i)!;
        const isMeal = i.kind === 'meal' || p.category === 'restaurant';
        const meal = isMeal ? (mealIdx++ === 0 ? 'lunch' : 'dinner') : null;
        return { id: i.id, durationMin: i.durationMin, locked: i.locked && !!i.fixedStart, fixedStartMin: hhmmToMin(i.fixedStart), openMin: hhmmToMin(p.openTime), closeMin: hhmmToMin(p.closeTime), meal };
      });
      const before = sorted.map((i) => i.id).join();
      const res = optimizeDay({ stops, dayStartMin: hhmmToMin(trip.dayStart) ?? 540, dayEndMin: hhmmToMin(trip.dayEnd) ?? 1260, matrixSec: matrix, hasStart: !!startPlace, travelTimesKnown: known });
      const newOrder = [...res.order.map((id) => sorted.find((i) => i.id === id)!), ...unlocated];
      await persistOrder(newOrder);
      const changed = newOrder.map((i) => i.id).join() !== before;
      if (known) {
        setMsg({
          tone: res.feasible ? 'success' : 'warn',
          text: `${changed ? 'Reordered' : 'Already in the best order found'} — about ${res.totalTravelMin} min of ${trip.travelMode === 'foot' ? 'walking' : trip.travelMode === 'bike' ? 'cycling' : 'driving'} (OSRM).${res.issues.length ? ' Issues: ' + res.issues.join('; ') : ''}${unlocated.length ? ` ${unlocated.length} item(s) without a location were left at the end.` : ''}`,
        });
        await loadRoute(newOrder.filter((i) => placeOf(i)));
      }
    } finally {
      setBusy(null);
    }
  };

  const loadRoute = async (list = located) => {
    if (list.length + (startPlace ? 1 : 0) < 2) { setMsg({ tone: 'info', text: 'Need at least two located stops to draw a route.' }); return; }
    setBusy('route');
    try {
      const pts = [...(startPlace ? [startPlace] : []), ...list.map((i) => placeOf(i)!)];
      const r = await fetchRoute(pts, trip.travelMode);
      setRoute({ key: routeKey(trip, list.map((i) => i.id)), geometry: r.geometry, legsSec: r.legs.map((l) => l.durationSec), routedIds: [...(startPlace ? ['__start'] : []), ...list.map((i) => i.id)], provider: r.provider });
    } catch (e) {
      setRoute(null);
      setMsg({ tone: 'error', text: `Couldn't get a route (${describeError(e)}). Use the Google Maps / OpenStreetMap directions links instead.` });
    } finally {
      setBusy(null);
    }
  };

  // Load the route once per day/order when the day opens (routes are cached, so this is usually free).
  const tried = useRef<string | null>(null);
  useEffect(() => {
    if (fresh || busy || tried.current === key || located.length + (startPlace ? 1 : 0) < 2 || !navigator.onLine) return;
    tried.current = key;
    void loadRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fresh]);

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = sorted.findIndex((i) => i.id === e.active.id);
    const to = sorted.findIndex((i) => i.id === e.over!.id);
    await persistOrder(arrayMove(sorted, from, to));
  };

  const addItem = async () => {
    const p = places.find((x) => x.id === newPlace);
    if (!p && !newTitle.trim()) return;
    await db.itinerary.put({ id: uid(), tripId: trip.id, date, placeId: p?.id, title: p?.name ?? newTitle.trim(), order: sorted.length, durationMin: p?.durationMin ?? 60, locked: false, kind: p?.category === 'restaurant' ? 'meal' : 'activity' });
    setNewPlace('');
    setNewTitle('');
    toast('Activity added', 'success');
  };

  const pointsForLink = [...(startPlace ? [startPlace] : []), ...located.map((i) => placeOf(i)!)];
  const gMode = trip.travelMode === 'foot' ? 'walking' : trip.travelMode === 'bike' ? 'bicycling' : 'driving';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={optimize} loading={busy === 'opt'}><Sparkles className="h-4 w-4" /> Optimize my day</Button>
        <Button size="sm" onClick={() => loadRoute()} loading={busy === 'route'}><Route className="h-4 w-4" /> View route</Button>
        {pointsForLink.length >= 2 && (
          <>
            <ExternalLink href={directionsLink(pointsForLink, gMode)!} className="text-xs"><Navigation className="h-3 w-3" /> Google Maps directions</ExternalLink>
            <ExternalLink href={directionsLink(pointsForLink, 'transit')!} className="text-xs">Transit directions</ExternalLink>
          </>
        )}
      </div>
      {msg && <Notice tone={msg.tone} className="text-xs">{msg.text}</Notice>}
      {fresh ? (
        <p className="text-[11px] text-slate-500">Travel times from {fresh.provider} ({trip.travelMode}). Public transit isn't available from free routing — use the transit link.</p>
      ) : (
        located.length > 1 && <p className="text-[11px] text-slate-500">Travel times not loaded for this order — press “View route”. Times below assume no travel and are flagged.</p>
      )}

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">Nothing planned for Day {dayIndex + 1}. Add saved places below or from the places list.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sorted.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2">
              {sorted.map((it, idx) => {
                const s = sched[idx];
                const p = placeOf(it);
                const n = p ? located.findIndex((x) => x.id === it.id) + 1 : null;
                return <SortableItem key={it.id} it={it} n={n} place={p} s={s} unknownTravel={!fresh && idx > 0 && !!p} />;
              })}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
        <div className="mb-2 text-xs font-semibold">Add activity</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select aria-label="Saved place" value={newPlace} onChange={(e) => setNewPlace(e.target.value)} className="sm:w-56">
            <option value="">Saved place…</option>
            {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <span className="self-center text-xs text-slate-400">or</span>
          <Input aria-label="Custom activity" value={newTitle} maxLength={100} placeholder="Custom (e.g. Check in, rest)" onChange={(e) => setNewTitle(e.target.value)} disabled={!!newPlace} />
          <Button onClick={addItem} disabled={!newPlace && !newTitle.trim()}><Plus className="h-4 w-4" /> Add</Button>
        </div>
      </div>
    </div>
  );
}

function SortableItem({ it, n, place, s, unknownTravel }: { it: ItineraryItem; n: number | null; place?: Place; s: ReturnType<typeof scheduleItems>[number]; unknownTravel: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: it.id });
  const upd = (patch: Partial<ItineraryItem>) => db.itinerary.update(it.id, patch);
  const color = place ? catMeta(place.category).color : '#94a3b8';
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`rounded-xl border border-slate-200 bg-white p-2.5 text-sm dark:border-slate-800 dark:bg-slate-900 ${isDragging ? 'z-10 shadow-lg' : ''}`}>
      {s.travelMin != null && <div className="mb-1 text-[11px] text-slate-500">↓ {Math.round(s.travelMin)} min travel</div>}
      {unknownTravel && <div className="mb-1 text-[11px] text-amber-600">↓ travel time unknown</div>}
      <div className="flex items-start gap-2">
        <button {...attributes} {...listeners} className="mt-0.5 cursor-grab touch-none rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={`Reorder ${it.title}`}><GripVertical className="h-4 w-4" /></button>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: color }}>{n ?? '·'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">{it.title}</span>
            {it.kind === 'reservation' && <Badge tone="violet">Reservation</Badge>}
            {it.kind === 'meal' && <Badge tone="red">Meal</Badge>}
            {!place && <Badge tone="slate">No location</Badge>}
          </div>
          <div className="tabular text-xs text-slate-500">{minToHHMM(s.startMin)}–{minToHHMM(s.endMin)}{place?.openTime && place.closeTime ? ` · open ${place.openTime}–${place.closeTime}` : ''}</div>
          {s.issues.map((x) => <div key={x} className="text-[11px] text-rose-600">⚠ {x}</div>)}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <label className="flex items-center gap-1">
              <NumberInput aria-label="Duration minutes" className="w-16 py-0.5 text-xs" value={it.durationMin} min={5} max={720} step={1} onChange={(v) => upd({ durationMin: v ?? 60 })} /> min
            </label>
            <Select aria-label="Kind" className="w-auto py-0.5 text-xs" value={it.kind} onChange={(e) => upd({ kind: e.target.value as ItineraryItem['kind'] })}>
              <option value="activity">Activity</option>
              <option value="meal">Meal</option>
              <option value="reservation">Reservation</option>
            </Select>
            <button onClick={() => upd({ locked: !it.locked, fixedStart: !it.locked ? it.fixedStart ?? minToHHMM(s.startMin) : it.fixedStart })} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${it.locked ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`} aria-pressed={it.locked}>
              {it.locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />} {it.locked ? 'Fixed at' : 'Lock time'}
            </button>
            {it.locked && <Input aria-label="Fixed start" type="time" className="w-28 py-0.5 text-xs" value={it.fixedStart ?? ''} onChange={(e) => upd({ fixedStart: e.target.value || undefined })} />}
            <button onClick={() => db.itinerary.delete(it.id)} className="ml-auto rounded p-1 text-slate-400 hover:text-rose-600" aria-label={`Remove ${it.title}`}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
    </li>
  );
}
