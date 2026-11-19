import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Plane, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import type { Cabin, DepartureAirport } from '../lib/types';
import type { ProgramOption } from '../engine/playbook';
import { fmtClock, fmtMinutes, partnersForAirlines, type RealFlight, type RealFlightResult } from '../engine/realFlights';
import { cachedFlights, getRelayConfig, getUsage, searchRealFlights, type FlightSearch } from '../providers/realFlights';
import { describeError } from '../providers/http';
import { fmtDateTime, usd } from '../lib/format';
import { db } from '../lib/db';
import { Badge, Button, ExternalLink, Notice, QualityBadge, Spinner } from './ui';

export interface ChosenFlight {
  flight: RealFlight;
  partnerId: string | null;
}

export function RealFlights({
  airports,
  to,
  depart,
  ret,
  adults,
  cabin,
  options,
  fallbackGoogleUrl,
  chosenId,
  onChoose,
}: {
  airports: DepartureAirport[];
  to: string[];
  depart: string;
  ret: string;
  adults: number;
  cabin: Cabin;
  options: ProgramOption[];
  fallbackGoogleUrl: string;
  chosenId?: string;
  onChoose: (c: ChosenFlight) => void;
}) {
  const nav = useNavigate();
  const cfg = useLiveQuery(() => getRelayConfig(), []);
  const usage = useLiveQuery(() => getUsage(), [db]);
  const q: FlightSearch = { from: airports.map((a) => a.code), to: to.join(','), depart, ret, adults, cabin };
  const qKey = JSON.stringify(q);
  const [state, setState] = useState<{ key: string; result?: RealFlightResult; fetchedAt?: string; fromCache?: boolean; loading?: boolean; error?: string }>({ key: '' });
  const [showAll, setShowAll] = useState(false);

  // show a cached result for these exact dates automatically (free — no search used)
  useEffect(() => {
    let alive = true;
    setState({ key: qKey });
    setShowAll(false);
    cachedFlights(q).then((hit) => {
      if (alive && hit) setState({ key: qKey, result: hit.result, fetchedAt: hit.fetchedAt, fromCache: true });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qKey]);

  const run = async (force = false) => {
    if (!cfg) return;
    setState({ key: qKey, loading: true });
    try {
      const r = await searchRealFlights(cfg, q, { force });
      setState({ key: qKey, ...r });
    } catch (e) {
      setState({ key: qKey, error: describeError(e) });
    }
  };

  if (cfg === undefined) return null;
  if (!cfg) {
    return (
      <Notice className="mt-2" title="Want real flights right here?">
        Connect the free flight search once (a SerpApi free account + a free Cloudflare relay, about 10 minutes) and PointPilot will list actual flights, times and prices for these dates.{' '}
        <button className="font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300" onClick={() => nav('/settings#real-flights')}>
          Set it up in Settings
        </button>
      </Notice>
    );
  }

  const left = cfg.monthlyCap - (usage?.count ?? 0);
  const res = state.key === qKey ? state.result : undefined;
  const ground = (code: string) => airports.find((a) => a.code === code);
  const sorted = res ? [...res.flights].sort((a, b) => Number(b.best) - Number(a.best) || (a.price ?? 1e9) - (b.price ?? 1e9)) : [];
  const shown = showAll ? sorted : sorted.slice(0, 6);

  return (
    <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/40 p-3 dark:border-sky-900 dark:bg-sky-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Plane className="h-4 w-4 text-sky-600" /> Real flights for these dates
          {res && state.fetchedAt && <QualityBadge q={state.fromCache ? 'cached' : 'live'} />}
        </div>
        {!res && !state.loading && (
          <Button size="sm" variant="primary" onClick={() => run()} disabled={left <= 0}>
            <Plane className="h-3.5 w-3.5" /> Find real flights
          </Button>
        )}
        {res && !state.loading && (
          <Button size="sm" variant="ghost" onClick={() => run(true)} disabled={left <= 0} title="Runs a new search (uses 1 of your monthly searches)">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        {res && state.fetchedAt ? `From Google Flights via your relay, fetched ${fmtDateTime(state.fetchedAt)}. ` : ''}
        Uses 1 search per new date/airport combo · {Math.max(0, left)} of your {cfg.monthlyCap} left this month ·{' '}
        <button className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline" onClick={() => nav('/settings#real-flights')}>
          <SettingsIcon className="h-3 w-3" /> settings
        </button>
      </p>

      {state.loading && (
        <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          <Spinner /> Searching Google Flights… (can take 10–30 seconds)
        </div>
      )}
      {state.error && (
        <Notice tone="warn" className="mt-2">
          {state.error}
        </Notice>
      )}

      {res && (
        <>
          {res.priceLevel && (
            <p className="mt-2 text-xs">
              Google says prices for these dates are <b>{res.priceLevel}</b>
              {res.typicalRange ? ` (typically ${usd(res.typicalRange[0])}–${usd(res.typicalRange[1])})` : ''}.
            </p>
          )}
          {!sorted.length ? (
            <p className="mt-2 text-sm text-slate-600">Google Flights returned no flights for these exact dates and airports. Try other dates in step 1.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {shown.map((f) => (
                <FlightRow key={f.id} f={f} options={options} adults={adults} groundCost={ground(f.legs[0].from)} chosen={f.id === chosenId} onChoose={onChoose} />
              ))}
            </ul>
          )}
          {sorted.length > 6 && (
            <button className="mt-2 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300" onClick={() => setShowAll((s) => !s)}>
              {showAll ? 'Show fewer' : `Show all ${sorted.length} flights`}
            </button>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            Prices are what Google Flights showed{ret ? ' for the round trip (outbound shown; Google pairs it with a return)' : ''}
            {adults > 1 ? ` for ${adults} travelers` : ''}. Seats and prices change — confirm before booking.{' '}
            <ExternalLink href={res.googleUrl || fallbackGoogleUrl}>Open this search on Google Flights</ExternalLink> to pick the return flight.
          </p>
        </>
      )}
    </div>
  );
}

function FlightRow({
  f,
  options,
  adults,
  groundCost,
  chosen,
  onChoose,
}: {
  f: RealFlight;
  options: ProgramOption[];
  adults: number;
  groundCost?: DepartureAirport;
  chosen: boolean;
  onChoose: (c: ChosenFlight) => void;
}) {
  const first = f.legs[0];
  const last = f.legs[f.legs.length - 1];
  const partnerIds = partnersForAirlines(f.airlines);
  const matched = options.filter((o) => partnerIds.includes(o.partner.id));
  const bestPartner = matched[0]?.partner.id ?? null;
  return (
    <li className={`rounded-lg border bg-white p-2.5 dark:bg-slate-900 ${chosen ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-slate-200 dark:border-slate-800'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {f.airlineLogo && <img src={f.airlineLogo} alt="" className="mt-0.5 h-6 w-6 shrink-0 object-contain" referrerPolicy="no-referrer" loading="lazy" />}
          <div className="min-w-0">
            <div className="text-sm font-semibold">
              {fmtClock(first.depart)} {first.from} → {fmtClock(last.arrive)} {last.to}
              {last.arrive.slice(0, 10) !== first.depart.slice(0, 10) && <span className="ml-1 text-[11px] font-normal text-amber-700">+1 day</span>}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              {f.airlines.join(' + ')} · {f.legs.map((l) => l.flightNumber).join(', ')} · {fmtMinutes(f.totalMinutes)} ·{' '}
              {f.stops === 0 ? 'Nonstop' : `${f.stops} stop${f.stops > 1 ? 's' : ''} (${f.layovers.map((l) => `${l.code} ${fmtMinutes(l.minutes)}${l.overnight ? ' overnight' : ''}`).join(', ')})`}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="tabular text-base font-bold">{f.price != null ? usd(f.price) : 'Price n/a'}</div>
          {f.best && <Badge tone="brand">Google “best”</Badge>}
          {groundCost && groundCost.groundCost > 0 && <div className="text-[11px] text-slate-500">+{usd(groundCost.groundCost)} to reach {groundCost.code}</div>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          <span className="text-slate-500">Book with points via:</span>
          {matched.length ? (
            matched.slice(0, 4).map((o) =>
              o.verifiedBonus ? (
                <span key={o.partner.id} className="rounded-full bg-gradient-to-r from-fuchsia-600 via-pink-500 to-orange-400 px-2 py-0.5 font-bold text-white">
                  ✨ {o.partner.name} +{o.verifiedBonus.bonusPercent}%
                </span>
              ) : (
                <Badge key={o.partner.id}>{o.partner.name}</Badge>
              ),
            )
          ) : (
            <Badge tone="amber">No Chase partner — cash or Chase Travel</Badge>
          )}
        </div>
        <Button size="sm" variant={chosen ? 'primary' : 'secondary'} onClick={() => onChoose({ flight: f, partnerId: bestPartner })} disabled={f.price == null}>
          {chosen ? 'Using this flight ↓' : 'Use this flight'}
        </Button>
      </div>
      {adults > 1 && <span className="sr-only">Price for {adults} travelers as shown by Google Flights</span>}
    </li>
  );
}
