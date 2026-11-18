import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { PointPilotDB, ensureSeeded, exportAll, importAll } from '../src/lib/db';

describe('IndexedDB persistence and JSON export/import', () => {
  it('seeds once and never overwrites user edits', async () => {
    const db = new PointPilotDB('test-seed');
    await ensureSeeded(db);
    expect(await db.partners.count()).toBeGreaterThan(10);
    await db.partners.update('united', { notes: 'my note' });
    await db.meta.delete('seedVersion');
    await ensureSeeded(db);
    expect((await db.partners.get('united'))!.notes).toBe('my note');
    expect((await db.profile.get('profile'))!.points).toBe(100000);
  });

  it('round-trips a trip with places and itinerary', async () => {
    const a = new PointPilotDB('test-a');
    await ensureSeeded(a);
    await a.trips.put({ id: 't1', name: 'Tokyo', city: 'Tokyo', lat: 35.68, lon: 139.65, startDate: '2027-04-10', endDate: '2027-04-16', travelers: 1, cashBudget: 1000, pointsBudget: 0, currency: 'USD', notes: '', dayStart: '09:00', dayEnd: '21:00', travelMode: 'foot', createdAt: '', updatedAt: '' });
    await a.places.put({ id: 'p1', tripId: 't1', name: 'Senso-ji', category: 'attraction', lat: 35.7148, lon: 139.7967, address: '', source: 'manual', notes: '', favorite: true, visited: false, durationMin: 60, createdAt: '' });
    const file = await exportAll(a);
    const json = JSON.parse(JSON.stringify(file));

    const b = new PointPilotDB('test-b');
    const rep = await importAll(json, b);
    expect(rep.imported.trips).toBe(1);
    expect((await b.places.get('p1'))!.name).toBe('Senso-ji');
  });

  it('single-trip export only includes that trip', async () => {
    const a = new PointPilotDB('test-c');
    await a.trips.bulkPut([{ id: 'x' } as never, { id: 'y' } as never]);
    await a.places.bulkPut([{ id: 'p', tripId: 'x' } as never, { id: 'q', tripId: 'y' } as never]);
    const f = await exportAll(a, 'x');
    expect((f.data.trips as { id: string }[]).map((t) => t.id)).toEqual(['x']);
    expect((f.data.places as { id: string }[]).map((t) => t.id)).toEqual(['p']);
    expect(f.data.profile).toBeUndefined();
  });

  it('rejects files that are not PointPilot exports', async () => {
    const b = new PointPilotDB('test-d');
    await expect(importAll({ hello: 1 }, b)).rejects.toThrow(/Not a PointPilot/);
    await expect(importAll(null, b)).rejects.toThrow();
  });
});
