import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2, Trophy } from 'lucide-react';
import { db, nowISO, uid } from '../lib/db';
import { useLastSearch, useProfile, useToday } from '../lib/hooks';
import { DESTINATIONS, getDestination } from '../data/destinations';
import { generateDatePairs, netFlightCost } from '../engine/flexDates';
import { flightLinks } from '../lib/links';
import { fmtDate, usd } from '../lib/format';
import type { DateMode, FlexPriceEntry } from '../lib/types';
import { MonthCalendar } from './MonthCalendar';
import { Badge, Button, Card, ExternalLink, Field, Notice, NumberInput, QualityBadge, Select } from './ui';

export function FlexDates({ initialDest }: { initialDest?: string }) {
  const profile = useProfile();
  const [search] = useLastSearch(profile);
  const today = useToday();
  const [destId, setDestId] = useState(initialDest ?? search.preferred[0] ?? 'honolulu');
  const [month, setMonth] = useState(search.month);
  const [year, setYear] = useState(search.year);
  const [mode, setMode] = useState<DateMode>(search.dateMode === 'specific' || search.dateMode === 'range' ? 'month' : search.dateMode);
  const [minDays, setMinDays] = useState(search.minDays);
  const [maxDays, setMaxDays] = useState(search.maxDays);
  const [travelers, setTravelers] = useState(search.travelers);
  const [day, setDay] = useState<string | null>(null);
  const airports = search.airports;
  const dest = getDestination(destId)!;
  const destAirport = dest.airports[0];

  const pairs = useMemo(
    () => generateDatePairs({ dateMode: mode, year, month, departDates: [], returnDates: [], minDays, maxDays }, today),
    [mode, year, month, minDays, maxDays, today],
  );
  const entries = useLiveQuery(() => db.flexPrices.where('destinationId').equals(destId).toArray(), [destId]) ?? [];
  const groundOf = (code: string) => airports.find((a) => a.code === code)?.groundCost ?? 0;
  const netOf = (e: FlexPriceEntry) => netFlightCost(e.pricePerPerson, travelers, groundOf(e.origin));

  const bestEntry = [...entries].sort((a, b) => netOf(a) - netOf(b))[0];
  const departDays = Array.from(new Set(pairs.map((p) => p.depart)));
  const byDay = new Map<string, number>();
  for (const e of entries) byDay.set(e.departDate, Math.min(byDay.get(e.departDate) ?? Infinity, netOf(e)));
  const prices = [...byDay.values()].sort((a, b) => a - b);
  const tier = (v: number): 'low' | 'mid' | 'high' => (prices.length < 3 ? 'mid' : v <= prices[Math.floor(prices.length / 3)] ? 'low' : v >= prices[Math.floor((2 * prices.length) / 3)] ? 'high' : 'mid');
  const marks: Record<string, 'low' | 'mid' | 'high' | 'info'> = {};
  for (const d of departDays) marks[d] = byDay.has(d) ? tier(byDay.get(d)!) : 'info';

  const dayPairs = day ? pairs.filter((p) => p.depart === day) : [];
  const record = async (origin: string, depart: string, ret: string, price: number | null) => {
    const existing = entries.find((e) => e.origin === origin && e.departDate === depart && e.returnDate === ret);
    if (price == null) { if (existing) await db.flexPrices.delete(existing.id); return; }
    await db.flexPrices.put({ id: existing?.id ?? uid(), destinationId: destId, origin, departDate: depart, returnDate: ret, pricePerPerson: price, source: 'Manual entry', recordedAt: nowISO() });
  };

  return (
    <div className="space-y-4">
      <Card title="Flexible-date comparison" subtitle="No free API provides reliable live price calendars, so PointPilot generates every valid date combination, opens prefilled searches, and lets you record the prices you see. Ground costs to alternate airports are added automatically.">
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Field label="Destination" htmlFor="fd-d" className="sm:col-span-2">
            <Select id="fd-d" value={destId} onChange={(e) => { setDestId(e.target.value); setDay(null); }}>
              {DESTINATIONS.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.airports.join('/')})</option>)}
            </Select>
          </Field>
          <Field label="Month" htmlFor="fd-m">
            <div className="flex gap-1">
              <Select id="fd-m" value={month} onChange={(e) => { setMonth(Number(e.target.value)); setDay(null); }}>
                {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{new Date(2000, i, 1).toLocaleString('en-US', { month: 'short' })}</option>)}
              </Select>
              <Select aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {[0, 1, 2].map((d) => <option key={d}>{new Date().getFullYear() + d}</option>)}
              </Select>
            </div>
          </Field>
          <Field label="Dates" htmlFor="fd-mode">
            <Select id="fd-mode" value={mode} onChange={(e) => setMode(e.target.value as DateMode)}>
              <option value="month">Any day</option>
              <option value="weekends">Weekends</option>
            </Select>
          </Field>
          <Field label="Days" htmlFor="fd-min">
            <div className="flex items-center gap-1">
              <NumberInput id="fd-min" aria-label="Min days" value={minDays} min={1} max={30} step={1} onChange={(v) => setMinDays(v ?? 1)} />–
              <NumberInput aria-label="Max days" value={maxDays} min={1} max={30} step={1} onChange={(v) => setMaxDays(v ?? 1)} />
            </div>
          </Field>
          <Field label="Travelers" htmlFor="fd-t"><NumberInput id="fd-t" value={travelers} min={1} max={9} step={1} onChange={(v) => setTravelers(v ?? 1)} /></Field>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {pairs.length} date combinations from {airports.map((a) => `${a.code}${a.groundCost ? ` (+$${a.groundCost})` : ''}`).join(', ')}. Change airports or ground costs on Explore or in Settings.
        </p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <Card title="Pick a departure day">
          <MonthCalendar year={year} month={month} selected={day ? [day] : []} marks={marks} disabledBefore={today} onToggle={(d) => setDay(day === d ? null : d)} />
          <div className="mt-3 flex flex-wrap gap-1 text-[11px]">
            <Badge tone="blue">Has valid trips</Badge>
            <Badge tone="green">Cheapest third recorded</Badge>
            <Badge tone="amber">Middle</Badge>
            <Badge tone="red">Priciest</Badge>
          </div>
          {bestEntry && (
            <Notice tone="success" className="mt-3" title={<span className="inline-flex items-center gap-1"><Trophy className="h-4 w-4" /> Best recorded</span>}>
              {bestEntry.origin} · {fmtDate(bestEntry.departDate)} → {fmtDate(bestEntry.returnDate)}: {usd(bestEntry.pricePerPerson)} pp, <b>{usd(netOf(bestEntry))}</b> total incl. ground cost. Recorded {fmtDate(bestEntry.recordedAt)} — <QualityBadge q="user" />
            </Notice>
          )}
        </Card>

        <Card title={day ? `Trips departing ${fmtDate(day)}` : 'Choose a day on the calendar'} subtitle="Enter the per-person round-trip price you see after opening a search. Leave blank to clear.">
          {!day && <p className="text-sm text-slate-500">Blue days have at least one valid trip length in your range.</p>}
          <div className="space-y-3">
            {dayPairs.map((p) => (
              <div key={p.ret} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="mb-2 text-sm font-medium">
                  Return {fmtDate(p.ret)} · {p.days} days / {p.nights} nights
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {airports.map((a) => {
                    const e = entries.find((x) => x.origin === a.code && x.departDate === p.depart && x.returnDate === p.ret);
                    const links = flightLinks({ origin: a.code, dest: destAirport, depart: p.depart, ret: p.ret, travelers, cabin: search.cabin });
                    return (
                      <div key={a.code} className="rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800/50">
                        <div className="mb-1 flex items-center justify-between">
                          <b>{a.code} → {destAirport}</b>
                          <span className="space-x-2">
                            <ExternalLink href={links[0].url}>Google</ExternalLink>
                            <ExternalLink href={links[1].url}>Kayak</ExternalLink>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>$/person</span>
                          <NumberInput aria-label={`Price from ${a.code}`} className="w-24 py-1 text-xs" value={e?.pricePerPerson ?? null} allowEmpty min={0} max={100000} onChange={(v) => record(a.code, p.depart, p.ret, v)} />
                          {e && <span className="tabular">= {usd(netOf(e))} total{a.groundCost ? ` (incl. $${a.groundCost} ground)` : ''}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {entries.length > 0 && (
        <Card title={`Recorded prices for ${dest.name}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr><th className="py-1">From</th><th>Depart</th><th>Return</th><th className="text-right">Per person</th><th className="text-right">Total incl. ground</th><th>Recorded</th><th /></tr>
              </thead>
              <tbody>
                {[...entries].sort((a, b) => netOf(a) - netOf(b)).map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1.5">{e.origin}</td>
                    <td>{fmtDate(e.departDate)}</td>
                    <td>{fmtDate(e.returnDate)}</td>
                    <td className="tabular text-right">{usd(e.pricePerPerson)}</td>
                    <td className="tabular text-right font-semibold">{usd(netOf(e))}</td>
                    <td className="text-xs text-slate-500">{fmtDate(e.recordedAt)}</td>
                    <td className="text-right"><Button size="sm" variant="ghost" aria-label="Delete" onClick={() => db.flexPrices.delete(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
