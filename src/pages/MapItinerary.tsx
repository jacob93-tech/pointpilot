import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Luggage } from 'lucide-react';
import { db, uid } from '../lib/db';
import { tripDateList } from '../engine/budget';
import { Card, EmptyState, Field, PageHeader, Select, Tabs, useToast } from '../components/ui';
import { TripMap } from '../components/TripMap';
import { PlacesPanel } from '../components/PlacesPanel';
import { DayPlanner, type DayRoute } from '../components/DayPlanner';
import type { Place, TravelMode } from '../lib/types';

export function MapItinerary() {
  const [qs, setQs] = useSearchParams();
  const trips = useLiveQuery(() => db.trips.orderBy('startDate').toArray(), []);
  const tripId = qs.get('trip') ?? trips?.[0]?.id;
  const trip = trips?.find((t) => t.id === tripId);
  const places = useLiveQuery(() => (tripId ? db.places.where('tripId').equals(tripId).toArray() : []), [tripId]) ?? [];
  const items = useLiveQuery(() => (tripId ? db.itinerary.where('tripId').equals(tripId).toArray() : []), [tripId]) ?? [];
  const dates = useMemo(() => (trip ? tripDateList(trip) : []), [trip]);
  const [view, setView] = useState<'all' | string>('all');
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<[number, number] | null>(null);
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const [routes, setRoutes] = useState<Record<string, DayRoute | null>>({});
  const toast = useToast();

  if (!trips) return null;
  if (!trips.length || !trip)
    return (
      <div>
        <PageHeader title="Map & Itinerary" />
        <EmptyState icon={<Luggage className="h-7 w-7" />} title="Create a trip first" action={<Link to="/trips" className="text-brand-700 underline">Go to My Trips</Link>}>
          Places and day plans belong to a trip.
        </EmptyState>
      </div>
    );

  const day = view !== 'all' && dates.includes(view) ? view : null;
  const dayItems = day ? items.filter((i) => i.date === day) : [];
  const dayStops = day
    ? [...dayItems].sort((a, b) => a.order - b.order).map((i) => places.find((p) => p.id === i.placeId)).filter((p): p is Place => !!p).map((place, i) => ({ place, n: i + 1 }))
    : undefined;
  const route = day ? routes[day] : null;

  const addToDay = async (p: Place, date: string) => {
    const count = items.filter((i) => i.date === date).length;
    await db.itinerary.put({ id: uid(), tripId: trip.id, date, placeId: p.id, title: p.name, order: count, durationMin: p.durationMin, locked: false, kind: p.category === 'restaurant' ? 'meal' : 'activity' });
    toast(`Added to Day ${dates.indexOf(date) + 1}`, 'success');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Map & Itinerary"
        subtitle="Save restaurants and sights, see them on an OpenStreetMap map, and plan each day. Route times come from free OSRM servers when they respond; otherwise you get honest fallbacks."
        action={
          <Select aria-label="Trip" value={trip.id} onChange={(e) => { setQs({ trip: e.target.value }); setView('all'); setRoutes({}); }} className="w-64">
            {trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        }
      />

      <Tabs<string>
        value={day ?? 'all'}
        onChange={setView}
        tabs={[{ id: 'all', label: 'All places' }, ...dates.map((d, i) => ({ id: d, label: `Day ${i + 1} · ${new Date(d + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })}` }))]}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-3 xl:sticky xl:top-4 xl:self-start">
          <Card className="p-2 sm:p-2">
            <TripMap
              center={[trip.lat, trip.lon]}
              places={places}
              dayStops={dayStops}
              route={route?.geometry}
              focus={focus}
              pending={picking ? picked : null}
              onMapClick={picking ? (lat, lon) => setPicked([lat, lon]) : undefined}
              className="h-[360px] sm:h-[520px]"
            />
          </Card>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Getting around" htmlFor="mi-mode">
              <Select id="mi-mode" value={trip.travelMode} onChange={(e) => { db.trips.update(trip.id, { travelMode: e.target.value as TravelMode }); setRoutes({}); }}>
                <option value="foot">Walking</option>
                <option value="driving">Driving</option>
                <option value="bike">Cycling</option>
              </Select>
            </Field>
            <Field label="Start each day from" htmlFor="mi-start">
              <Select id="mi-start" value={trip.startPlaceId ?? ''} onChange={(e) => { db.trips.update(trip.id, { startPlaceId: e.target.value || undefined }); setRoutes({}); }}>
                <option value="">— first activity —</option>
                {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          </div>
        </div>

        <div>
          {day ? (
            <Card title={`Day ${dates.indexOf(day) + 1}`} subtitle={`${new Date(day + 'T12:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · ${trip.dayStart}–${trip.dayEnd}`}>
              <DayPlanner trip={trip} date={day} dayIndex={dates.indexOf(day)} items={dayItems} places={places} routeState={routes[day] ?? null} setRoute={(r) => setRoutes((x) => ({ ...x, [day]: r }))} />
            </Card>
          ) : (
            <Card title="Places">
              <PlacesPanel
                trip={trip}
                places={places}
                dates={dates}
                pickedPoint={picked}
                onRequestPick={(on) => { setPicking(on); if (!on) setPicked(null); }}
                onFocus={(p) => setFocus([p.lat, p.lon])}
                onAddToDay={addToDay}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
