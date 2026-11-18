import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Search, X } from 'lucide-react';
import type { Cabin, DateMode, SearchParams, TripStyle } from '../lib/types';
import { CARDS } from '../data/cards';
import { US_AIRPORTS } from '../data/airports';
import { DESTINATIONS } from '../data/destinations';
import { Button, Chip, Field, NumberInput, Select } from './ui';
import { MonthCalendar } from './MonthCalendar';
import { todayISO } from '../engine/transfer';

export const STYLES: { id: TripStyle; label: string }[] = [
  { id: 'beach', label: 'Beach' },
  { id: 'food', label: 'Food' },
  { id: 'culture', label: 'Culture' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'nature', label: 'Nature' },
  { id: 'nightlife', label: 'Nightlife' },
  { id: 'city', label: 'City' },
  { id: 'relaxation', label: 'Relaxation' },
  { id: 'shopping', label: 'Shopping' },
];

export const CABINS: { id: Cabin; label: string }[] = [
  { id: 'economy', label: 'Economy' },
  { id: 'premium', label: 'Premium economy' },
  { id: 'business', label: 'Business' },
  { id: 'first', label: 'First' },
];

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, label: new Date(2000, i, 1).toLocaleString('en-US', { month: 'long' }) }));

export function SearchForm({ value, onChange, onSubmit, compact }: { value: SearchParams; onChange: (p: SearchParams) => void; onSubmit: () => void; compact?: boolean }) {
  const [more, setMore] = useState(!compact);
  const [addCode, setAddCode] = useState('');
  const set = <K extends keyof SearchParams>(k: K, v: SearchParams[K]) => onChange({ ...value, [k]: v });
  const year = new Date().getFullYear();
  const today = todayISO();
  const toggleIn = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v].sort());

  const errors: string[] = [];
  if (value.points < 0) errors.push('Points can’t be negative.');
  if (value.minDays > value.maxDays) errors.push('Minimum trip length is longer than the maximum.');
  if (!value.airports.length) errors.push('Add at least one departure airport.');
  if (value.dateMode === 'range' && (!value.rangeStart || !value.rangeEnd || value.rangeEnd < value.rangeStart)) errors.push('Pick a valid date range.');
  if (value.dateMode === 'specific' && (!value.departDates.length || !value.returnDates.length)) errors.push('Pick at least one departure and one return date.');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!errors.length) onSubmit();
      }}
      className="space-y-4"
      aria-label="Trip search"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Chase points balance" htmlFor="sf-points">
          <NumberInput id="sf-points" value={value.points} min={0} max={50_000_000} step={1} onChange={(v) => {
            const p = v ?? 0;
            // keep "max points to spend" tied to the balance unless the user lowered it
            const maxPoints = value.maxPoints >= value.points ? p : Math.min(value.maxPoints, p);
            onChange({ ...value, points: p, maxPoints });
          }} />
        </Field>
        <Field label="Chase card" htmlFor="sf-card">
          <Select id="sf-card" value={value.cardId} onChange={(e) => set('cardId', e.target.value as SearchParams['cardId'])}>
            {CARDS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.transferEligible ? '' : ' (no transfers)'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Max cash out of pocket" htmlFor="sf-cash">
          <NumberInput id="sf-cash" value={value.maxCash} min={0} max={1_000_000} step={1} onChange={(v) => set('maxCash', v ?? 0)} />
        </Field>
        <Field label="Travelers" htmlFor="sf-trav">
          <NumberInput id="sf-trav" value={value.travelers} min={1} max={9} step={1} onChange={(v) => set('travelers', v ?? 1)} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Travel month" htmlFor="sf-month">
          <div className="flex gap-2">
            <Select id="sf-month" className="min-w-0 flex-1" value={value.month} onChange={(e) => set('month', Number(e.target.value))} aria-label="Month">
              {MONTHS.map((m) => (
                <option key={m.m} value={m.m}>
                  {m.label}
                </option>
              ))}
            </Select>
            <Select value={value.year} onChange={(e) => set('year', Number(e.target.value))} aria-label="Year" className="w-[6.5rem] shrink-0">
              {[year, year + 1, year + 2].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
        </Field>
        <Field label="Trip length (days)" htmlFor="sf-min">
          <div className="flex items-center gap-2">
            <NumberInput id="sf-min" aria-label="Minimum days" value={value.minDays} min={1} max={60} step={1} onChange={(v) => set('minDays', v ?? 1)} />
            <span className="text-slate-400">–</span>
            <NumberInput aria-label="Maximum days" value={value.maxDays} min={1} max={60} step={1} onChange={(v) => set('maxDays', v ?? 1)} />
          </div>
        </Field>
        <Field label="Cabin" htmlFor="sf-cabin">
          <Select id="sf-cabin" value={value.cabin} onChange={(e) => set('cabin', e.target.value as Cabin)}>
            {CABINS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Where" htmlFor="sf-scope">
          <Select id="sf-scope" value={value.scope} onChange={(e) => set('scope', e.target.value as SearchParams['scope'])}>
            <option value="both">Domestic & international</option>
            <option value="domestic">Domestic only (incl. Hawaii, Puerto Rico)</option>
            <option value="international">International only</option>
          </Select>
        </Field>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">Departure airports</div>
        <div className="flex flex-wrap items-center gap-2">
          {value.airports.map((a, i) => (
            <span key={a.code} className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white py-1 pl-3 pr-1 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900">
              {a.code}
              {a.isHome ? <span className="font-normal text-slate-500">· home</span> : <span className="font-normal text-slate-500">· +${a.groundCost} to get there</span>}
              <button
                type="button"
                aria-label={`Remove ${a.code}`}
                className="rounded-full p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => {
                  const next = value.airports.filter((_, j) => j !== i);
                  if (a.isHome && next[0]) next[0] = { ...next[0], isHome: true };
                  set('airports', next);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <div className="flex items-center gap-1">
            <Select value={addCode} onChange={(e) => setAddCode(e.target.value)} className="w-44 py-1 text-xs" aria-label="Add airport">
              <option value="">Add nearby airport…</option>
              {US_AIRPORTS.filter((a) => !value.airports.some((x) => x.code === a.code)).map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.city}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              size="sm"
              disabled={!addCode}
              onClick={() => {
                set('airports', [...value.airports, { code: addCode, groundCost: value.airports.length ? 80 : 0, groundHours: value.airports.length ? 2 : 0, isHome: !value.airports.length }]);
                setAddCode('');
              }}
            >
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">Ground costs (gas, parking, rideshare) are added to that airport's fares so a cheaper LAX fare doesn't automatically beat SAN. Edit them under “More options”.</p>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">Trip style (optional)</div>
        <div className="flex flex-wrap gap-1.5">
          {STYLES.map((s) => (
            <Chip key={s.id} active={value.styles.includes(s.id)} onClick={() => set('styles', toggleIn(value.styles, s.id) as TripStyle[])}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      <button type="button" onClick={() => setMore((m) => !m)} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 dark:text-brand-300" aria-expanded={more}>
        {more ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} {more ? 'Fewer options' : 'More options: dates, limits, airports, destinations'}
      </button>

      {more && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Dates" htmlFor="sf-mode">
              <Select id="sf-mode" value={value.dateMode} onChange={(e) => set('dateMode', e.target.value as DateMode)}>
                <option value="month">Flexible — whole month</option>
                <option value="weekends">Weekends in the month</option>
                <option value="range">Date range</option>
                <option value="specific">Specific departure / return dates</option>
              </Select>
            </Field>
            <Field label="Max points to spend" htmlFor="sf-maxpts" hint="Defaults to your balance.">
              <NumberInput id="sf-maxpts" value={value.maxPoints} min={0} max={50_000_000} step={1} onChange={(v) => set('maxPoints', v ?? 0)} />
            </Field>
            <Field label="Max est. flight time (h, each way)" htmlFor="sf-hours" hint="Applied to estimates.">
              <NumberInput id="sf-hours" allowEmpty placeholder="Any" value={value.maxFlightHours} min={1} max={30} onChange={(v) => set('maxFlightHours', v)} />
            </Field>
            <Field label="Max layovers" htmlFor="sf-lay" hint="Saved for real itineraries; can't filter estimates.">
              <Select id="sf-lay" value={value.maxLayovers ?? ''} onChange={(e) => set('maxLayovers', e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">Any</option>
                <option value="0">Nonstop only</option>
                <option value="1">Up to 1</option>
                <option value="2">Up to 2</option>
              </Select>
            </Field>
          </div>

          {value.dateMode === 'range' && (
            <div className="grid grid-cols-2 gap-3 md:w-1/2">
              <Field label="Earliest departure" htmlFor="sf-rs">
                <input id="sf-rs" type="date" min={today} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" value={value.rangeStart ?? ''} onChange={(e) => set('rangeStart', e.target.value)} />
              </Field>
              <Field label="Latest return" htmlFor="sf-re">
                <input id="sf-re" type="date" min={value.rangeStart ?? today} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" value={value.rangeEnd ?? ''} onChange={(e) => set('rangeEnd', e.target.value)} />
              </Field>
            </div>
          )}
          {value.dateMode === 'specific' && (
            <div className="grid gap-4 sm:grid-cols-2 md:max-w-2xl">
              <MonthCalendar label="Possible departures" year={value.year} month={value.month} selected={value.departDates} disabledBefore={today} onToggle={(d) => set('departDates', toggleIn(value.departDates, d))} />
              <MonthCalendar label="Possible returns" year={value.year} month={value.month} selected={value.returnDates} disabledBefore={today} onToggle={(d) => set('returnDates', toggleIn(value.returnDates, d))} />
            </div>
          )}

          <div>
            <div className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">Airport ground costs (round trip, your estimate)</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {value.airports.map((a, i) => (
                <div key={a.code} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs dark:border-slate-800 dark:bg-slate-900">
                  <span className="w-10 font-semibold">{a.code}</span>
                  <label className="flex items-center gap-1">
                    $<NumberInput aria-label={`${a.code} ground cost`} className="w-20 py-1 text-xs" value={a.groundCost} min={0} max={5000} onChange={(v) => set('airports', value.airports.map((x, j) => (j === i ? { ...x, groundCost: v ?? 0 } : x)))} />
                  </label>
                  <label className="flex items-center gap-1">
                    <NumberInput aria-label={`${a.code} travel hours`} className="w-14 py-1 text-xs" value={a.groundHours} min={0} max={24} onChange={(v) => set('airports', value.airports.map((x, j) => (j === i ? { ...x, groundHours: v ?? 0 } : x)))} />h
                  </label>
                  <label className="ml-auto flex items-center gap-1">
                    <input type="radio" name="home-ap" checked={a.isHome} onChange={() => set('airports', value.airports.map((x, j) => ({ ...x, isHome: j === i })))} /> home
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <DestPicker label="Preferred destinations (boost)" selected={value.preferred} onChange={(v) => set('preferred', v)} />
            <DestPicker label="Excluded destinations" selected={value.excluded} onChange={(v) => set('excluded', v)} />
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <ul className="text-sm text-rose-600" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <Button type="submit" variant="primary" size="lg" className="w-full sm:w-auto" disabled={errors.length > 0}>
        <Search className="h-4 w-4" /> Find trips for my points
      </Button>
    </form>
  );
}

function DestPicker({ label, selected, onChange }: { label: string; selected: string[]; onChange: (v: string[]) => void }) {
  const [pick, setPick] = useState('');
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-slate-200 py-0.5 pl-2.5 pr-1 text-xs dark:bg-slate-800">
            {DESTINATIONS.find((d) => d.id === id)?.name ?? id}
            <button type="button" aria-label="Remove" onClick={() => onChange(selected.filter((x) => x !== id))} className="rounded-full p-0.5 hover:bg-slate-300 dark:hover:bg-slate-700">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <Select
          value={pick}
          aria-label={label}
          className="w-48 py-1 text-xs"
          onChange={(e) => {
            const v = e.target.value;
            setPick('');
            if (v && !selected.includes(v)) onChange([...selected, v]);
          }}
        >
          <option value="">Add…</option>
          {DESTINATIONS.filter((d) => !selected.includes(d.id)).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
