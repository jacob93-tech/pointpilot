import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, ExternalLink, Field, Input, Notice, NumberInput, PageHeader, Select, Tabs } from '../components/ui';
import { ComparisonsTab } from '../components/ComparisonEditor';
import { RedemptionCalculator } from '../components/RedemptionCalculator';
import { FlexDates } from '../components/FlexDates';
import { CABINS } from '../components/SearchForm';
import { flightLinks } from '../lib/links';
import type { Cabin, Comparison } from '../lib/types';
import { useProfile } from '../lib/hooks';
import { addDays } from '../engine/flexDates';
import { todayISO } from '../engine/transfer';

type Tab = 'compare' | 'calculator' | 'flex' | 'links';

export function FlightsPoints() {
  const [qs, setQs] = useSearchParams();
  const tab = (qs.get('tab') as Tab) || 'compare';
  const initial = useMemo<(Partial<Comparison> & { openId?: string }) | undefined>(() => {
    if (qs.get('id')) return { openId: qs.get('id')! };
    if (qs.get('new')) {
      const dest = qs.get('dest') ?? undefined;
      return {
        kind: 'flight',
        destinationId: dest,
        origin: qs.get('origin') ?? undefined,
        destination: qs.get('to') ?? undefined,
        departDate: qs.get('depart') ?? undefined,
        returnDate: qs.get('ret') ?? undefined,
        travelers: Number(qs.get('trav') ?? 1) || 1,
        cabin: (qs.get('cabin') as Cabin) ?? 'economy',
      };
    }
    return undefined;
  }, [qs]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Flights & Points"
        subtitle="Record real cash and award prices, compare every way to pay, and work through flexible dates. Nothing here pretends to be live inventory: links open real searches and you record what you find, with its source and date."
      />
      <Tabs<Tab>
        value={tab}
        onChange={(t) => setQs({ tab: t })}
        tabs={[
          { id: 'compare', label: 'Cash vs points comparisons' },
          { id: 'calculator', label: 'Redemption calculator' },
          { id: 'flex', label: 'Flexible dates' },
          { id: 'links', label: 'Award search links' },
        ]}
      />
      {tab === 'compare' && <ComparisonsTab initial={initial} />}
      {tab === 'calculator' && <RedemptionCalculator />}
      {tab === 'flex' && <FlexDates initialDest={qs.get('dest') ?? undefined} />}
      {tab === 'links' && <SearchLinks />}
    </div>
  );
}

function SearchLinks() {
  const profile = useProfile();
  const [origin, setOrigin] = useState(profile.airports.map((a) => a.code).join(','));
  const [dest, setDest] = useState('HNL');
  const [depart, setDepart] = useState(addDays(todayISO(), 30));
  const [ret, setRet] = useState(addDays(todayISO(), 36));
  const [oneWay, setOneWay] = useState(false);
  const [travelers, setTravelers] = useState(profile.travelers);
  const [cabin, setCabin] = useState<Cabin>(profile.cabin);
  const valid = /^[A-Z]{3}(,[A-Z]{3})*$/.test(origin) && /^[A-Z]{3}$/.test(dest) && !!depart && (oneWay || ret >= depart);
  const links = valid ? flightLinks({ origin, dest, depart, ret: oneWay ? undefined : ret, travelers, cabin }) : [];
  return (
    <Card title="Award & cash search links" subtitle="Prefilled where the site supports it. Seats.aero, ExpertFlyer and similar paid tools aren't required.">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="From (comma-separate for Kayak)" htmlFor="sl-o"><Input id="sl-o" value={origin} onChange={(e) => setOrigin(e.target.value.toUpperCase().replace(/[^A-Z,]/g, ''))} /></Field>
        <Field label="To" htmlFor="sl-d"><Input id="sl-d" value={dest} maxLength={3} onChange={(e) => setDest(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} /></Field>
        <Field label="Depart" htmlFor="sl-dd"><Input id="sl-dd" type="date" value={depart} onChange={(e) => setDepart(e.target.value)} /></Field>
        <Field label="Return" htmlFor="sl-rd"><Input id="sl-rd" type="date" disabled={oneWay} value={ret} min={depart} onChange={(e) => setRet(e.target.value)} /></Field>
        <Field label="Travelers" htmlFor="sl-t"><NumberInput id="sl-t" value={travelers} min={1} max={9} step={1} onChange={(v) => setTravelers(v ?? 1)} /></Field>
        <Field label="Cabin" htmlFor="sl-c">
          <Select id="sl-c" value={cabin} onChange={(e) => setCabin(e.target.value as Cabin)}>
            {CABINS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </Field>
      </div>
      <label className="mt-2 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={oneWay} onChange={(e) => setOneWay(e.target.checked)} /> One way</label>
      {!valid && <Notice tone="warn" className="mt-3">Enter 3-letter airport codes and valid dates.</Notice>}
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <li key={l.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
            <ExternalLink href={l.url} className="font-medium">{l.label}</ExternalLink>
            <div className="mt-0.5 text-[11px] text-slate-500">{l.kind === 'cash' ? 'Cash fares' : l.kind === 'portal' ? 'Chase portal' : 'Award search'} · {l.prefilled ? 'prefilled (best effort)' : 'enter details on site'}</div>
            {l.note && <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{l.note}</div>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500">A search link never confirms availability. When you find space, record it under “Cash vs points comparisons” with the date you saw it.</p>
    </Card>
  );
}
