import type { Destination, Expense, SearchParams, Trip } from './types';
import type { TripEstimate } from '../engine/ranking';
import { mid } from '../engine/estimates';
import { db, nowISO, uid } from './db';
import { todayISO } from '../engine/transfer';

export async function createTripFromDestination(d: Destination, depart: string, ret: string, params: SearchParams, t?: TripEstimate): Promise<string> {
  const id = uid();
  const now = nowISO();
  const trip: Trip = {
    id,
    name: `${d.name} trip`,
    destinationId: d.id,
    city: d.name,
    lat: d.lat,
    lon: d.lon,
    startDate: depart,
    endDate: ret,
    travelers: params.travelers,
    cashBudget: params.maxCash,
    pointsBudget: t ? Math.round(t.recommended.points / 1000) * 1000 : 0,
    currency: 'USD',
    notes: '',
    dayStart: '09:00',
    dayEnd: '21:00',
    travelMode: 'foot',
    createdAt: now,
    updatedAt: now,
  };
  const expenses: Expense[] = [];
  if (t) {
    const s = t.recommended;
    const add = (category: Expense['category'], amount: number, description: string, pointsUsed = 0) =>
      amount > 0 &&
      expenses.push({ id: uid(), tripId: id, category, description, kind: 'estimated', amount: Math.round(amount), currency: 'USD', amountHome: Math.round(amount), pointsUsed, date: depart || todayISO(), createdAt: now });
    add('flights', s.flightMethod === 'cash' ? mid(t.flight.cash) : s.flightMethod === 'award' ? mid(t.flight.awardFees) : 0, `Flights (${s.flightMethod === 'cash' ? 'cash' : s.flightMethod === 'award' ? 'award taxes/fees' : 'Chase Travel'}) — estimate from Explore`);
    add('hotels', s.hotelMethod === 'cash' ? mid(t.hotel.cash) : 0, `Hotel (${s.hotelMethod === 'cash' ? 'cash' : 'points'}) — estimate from Explore`);
    const days = t.days * params.travelers;
    add('food', mid(d.costs.foodDay) * days, 'Food — estimate from Explore');
    add('transportation', mid(d.costs.localDay) * days + t.groundToAirport, 'Local transport + getting to the airport — estimate');
    add('attractions', mid(d.costs.activityDay) * days, 'Attractions — estimate from Explore');
  }
  await db.transaction('rw', db.trips, db.expenses, async () => {
    await db.trips.put(trip);
    // drop placeholder rows for points-paid categories (amount ≈ 0)
    await db.expenses.bulkPut(expenses.filter((e) => e.amount >= 1));
  });
  return id;
}

export async function createBlankTrip(name: string, city: string, lat: number, lon: number, start: string, end: string): Promise<string> {
  const id = uid();
  const now = nowISO();
  await db.trips.put({
    id, name, city, lat, lon, startDate: start, endDate: end, travelers: 1, cashBudget: 1000, pointsBudget: 0, currency: 'USD', notes: '', dayStart: '09:00', dayEnd: '21:00', travelMode: 'foot', createdAt: now, updatedAt: now,
  });
  return id;
}

export async function toggleSavedDestination(id: string): Promise<boolean> {
  const cur = await db.savedDestinations.get(id);
  if (cur) {
    await db.savedDestinations.delete(id);
    return false;
  }
  await db.savedDestinations.put({ id, note: '', createdAt: nowISO() });
  return true;
}

export async function deleteTrip(id: string): Promise<void> {
  await db.transaction('rw', [db.trips, db.places, db.itinerary, db.expenses], async () => {
    await db.places.where('tripId').equals(id).delete();
    await db.itinerary.where('tripId').equals(id).delete();
    await db.expenses.where('tripId').equals(id).delete();
    await db.trips.delete(id);
  });
}
