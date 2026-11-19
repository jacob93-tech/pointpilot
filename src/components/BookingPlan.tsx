import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightLeft, ClipboardPen, Hotel, TriangleAlert } from 'lucide-react';
import type { TripEstimate } from '../engine/ranking';
import type { Profile, SearchParams } from '../lib/types';
import { candidateDates, programOptions, type ProgramOption } from '../engine/playbook';
import { planTransfer, formatRatio } from '../engine/transfer';
import { centsPerPoint, judge } from '../engine/redemption';
import { mid } from '../engine/estimates';
import { flightLinks, hotelLinks } from '../lib/links';
import { useTransferContext } from '../lib/hooks';
import { cpp, fmtDate, pts, ptsRange, usd, usdRange } from '../lib/format';
import { getCard } from '../data/cards';
import { NO_PARTNER_AIRLINES, PROGRAMS_COMPILED } from '../data/programs';
import { Badge, Button, ExternalLink, Field, Notice, NumberInput } from './ui';

const CABIN_WORD = { economy: 'Economy', premium: 'Premium economy', business: 'Business', first: 'First' } as const;

export function BookingPlan({
  t,
  params,
  profile,
  dates,
  setDates,
}: {
  t: TripEstimate;
  params: SearchParams;
  profile: Profile;
  dates: { depart: string; ret: string };
  setDates: (d: { depart: string; ret: string }) => void;
}) {
  const nav = useNavigate();
  const ctx = useTransferContext(profile);
  const d = t.destination;
  const card = getCard(params.cardId);
  const destAirport = d.airports[0];
  const travelers = Math.max(1, params.travelers);
  const candidates = useMemo(() => candidateDates(params, t.days, ctx?.today), [params, t.days, ctx?.today]);
  const options = useMemo(
    () => (ctx ? programOptions(d, t.distanceMi, params.cabin, travelers, t.flight.cash, params.cardId, ctx) : []),
    [ctx, d, t.distanceMi, params.cabin, travelers, t.flight.cash, params.cardId],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const selected = options.find((o) => o.partner.id === picked) ?? options[0];

  const links = flightLinks({ origin: t.origin.code, dest: destAirport, depart: dates.depart, ret: dates.ret, travelers, cabin: params.cabin });
  const google = links.find((l) => l.id === 'google-flights')!;
  const searchLinkFor = (o: ProgramOption) => {
    const l = links.find((x) => x.id === o.partner.id);
    return l && l.prefilled ? { url: l.url, prefilled: true } : { url: o.guide.searchUrl, prefilled: false };
  };
  const recordUrl = `/flights?tab=compare&new=1&dest=${d.id}&origin=${t.origin.code}&to=${destAirport}&depart=${dates.depart}&ret=${dates.ret}&trav=${travelers}&cabin=${params.cabin}`;

  return (
    <div className="space-y-5">
      <Notice title="Where the points number comes from">
        The {t.flight.awardPoints ? ptsRange(t.flight.awardPoints) : '—'} points for flights isn’t from specific flights. It’s a typical saver-award range for a ~
        {t.distanceMi.toLocaleString()}-mile round trip ({t.origin.code} ⇄ {destAirport}, {travelers} traveler{travelers > 1 ? 's' : ''}, {CABIN_WORD[params.cabin].toLowerCase()})
        {t.flight.awardProgram ? `, with your verified +${t.flight.awardProgram.bonusPercent}% ${t.flight.awardProgram.name} bonus applied` : ''}. PointPilot has no free way to see real flights or award seats, so
        here are the dates to search and exactly how to book. When you find a real flight, record it and PointPilot uses your numbers instead.
      </Notice>

      {/* STEP 1 */}
      <Step n={1} title="Pick dates to search">
        <div className="flex flex-wrap gap-2">
          {candidates.map((c) => {
            const on = c.depart === dates.depart && c.ret === dates.ret;
            return (
              <button
                key={c.depart + c.ret}
                onClick={() => setDates({ depart: c.depart, ret: c.ret })}
                aria-pressed={on}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${on ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'}`}
              >
                <div className="font-semibold">
                  {fmtDate(c.depart, { weekday: 'short', month: 'short', day: 'numeric' })} → {fmtDate(c.ret, { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <div className="text-[11px] text-slate-500">{c.label}</div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Starting points only — PointPilot hasn’t checked prices for these dates. Change them under the Overview tab, or use{' '}
          <button className="text-brand-700 underline-offset-2 hover:underline dark:text-brand-300" onClick={() => nav(`/flights?tab=flex&dest=${d.id}`)}>
            Compare flexible dates
          </button>{' '}
          to log prices for many dates.
        </p>
      </Step>

      {/* STEP 2 */}
      <Step n={2} title="See which airlines fly it — and the cash price">
        <p className="text-sm">
          Open{' '}
          <ExternalLink href={google.url} className="font-semibold">
            Google Flights: {t.origin.code} → {destAirport}, {fmtDate(dates.depart, { month: 'short', day: 'numeric' })}–{fmtDate(dates.ret, { month: 'short', day: 'numeric' })}
          </ExternalLink>
          . Note the airlines with good times and the <b>total cash price for {travelers} traveler{travelers > 1 ? 's' : ''}</b>. The airline decides which Chase partner to use in step 3; the cash
          price tells you whether points are worth it.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          No Chase transfer partner books {NO_PARTNER_AIRLINES.join(', ')} — for those, pay cash or use Chase Travel (step 5).
        </p>
      </Step>

      {/* STEP 3 */}
      <Step n={3} title="Choose the Chase partner that books that airline">
        {!card.transferEligible ? (
          <Notice tone="warn">{card.name} can’t transfer points to airlines on its own. Use Chase Travel (step 5), or combine points into a Sapphire / Ink Preferred card first.</Notice>
        ) : !options.length ? (
          <p className="text-sm text-slate-500">Loading partners…</p>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
            <div className="hidden bg-slate-50 px-3 py-2 text-xs text-slate-500 sm:grid sm:grid-cols-[1.3fr_1.7fr_7rem_8rem] sm:gap-3 dark:bg-slate-800/60">
              <span>Transfer to</span>
              <span>Use it if Google Flights shows…</span>
              <span className="text-right">Est. Chase pts</span>
              <span />
            </div>
            {options.map((o) => {
              const on = o === selected;
              const link = searchLinkFor(o);
              return (
                <div key={o.partner.id} className={`grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[1.3fr_1.7fr_7rem_8rem] ${on ? 'bg-brand-50 dark:bg-brand-900/30' : ''}`}>
                  <div className="min-w-0">
                    <div className="font-medium">{o.partner.name}</div>
                    <div className="text-[11px] text-slate-500">{o.partner.program} · {formatRatio(o.ratio)}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {o.verifiedBonus && <Badge tone="green">+{o.verifiedBonus.bonusPercent}% bonus (verified)</Badge>}
                      {o.reportedBonus && <Badge tone="amber">+{o.reportedBonus.bonusPercent}% reported — verify on Chase</Badge>}
                      {o.partner.seedConfidence === 'reported-new' && <Badge tone="amber">New partner — verify</Badge>}
                      {o.guide.pricing === 'revenue' && <Badge>Points track cash fare</Badge>}
                    </div>
                  </div>
                  <div className="tabular text-right sm:order-3">
                    {o.verifiedBonus ? (
                      <>
                        <div className="text-[11px] text-slate-500 line-through">{ptsRange(o.chasePointsNoBonus)}</div>
                        <div className="mt-0.5 inline-block whitespace-nowrap rounded-full bg-gradient-to-r from-fuchsia-600 via-pink-500 to-orange-400 px-2 py-0.5 text-xs font-extrabold text-white shadow-sm">
                          ✨ {ptsRange(o.chasePoints)}
                        </div>
                      </>
                    ) : (
                      <div className="font-semibold">{ptsRange(o.chasePoints)}</div>
                    )}
                    {o.chasePointsIfReported && <div className="text-[11px] text-amber-700 dark:text-amber-400">{ptsRange(o.chasePointsIfReported)} if bonus is real</div>}
                  </div>
                  <div className="col-span-2 text-xs text-slate-600 sm:order-2 sm:col-span-1 dark:text-slate-400">
                    <span className="font-medium sm:hidden">Use if you see: </span>
                    {o.guide.books.slice(0, 6).join(', ')}
                    {o.guide.books.length > 6 ? '…' : ''}
                  </div>
                  <div className="col-span-2 flex items-center justify-between gap-2 sm:order-4 sm:col-span-1 sm:flex-col sm:items-end sm:justify-start">
                    <Button size="sm" variant={on ? 'primary' : 'secondary'} onClick={() => setPicked(o.partner.id)} aria-pressed={on}>
                      {on ? 'Showing steps ↓' : 'Show steps'}
                    </Button>
                    <ExternalLink href={link.url} className="text-xs">
                      {link.prefilled ? 'Search these dates' : 'Open site'}
                    </ExternalLink>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-1 text-[11px] text-slate-500">
          Estimates for all {travelers} traveler{travelers > 1 ? 's' : ''}, round trip, in Chase points (card ratio and 1,000-point transfer steps applied). Only bonuses you’ve verified on Chase are
          applied. Partner lists compiled {fmtDate(PROGRAMS_COMPILED)} — airlines change partners, so check the program’s site.
        </p>
      </Step>

      {/* STEP 4 */}
      {selected && <Walkthrough o={selected} t={t} params={params} profile={profile} dates={dates} search={searchLinkFor(selected)} onRecord={() => nav(recordUrl)} />}

      {/* STEP 5 */}
      <Step n={5} title="Compare with Chase Travel before transferring">
        <p className="text-sm">
          Chase Travel books any airline (including budget carriers) straight from your points at {card.travelBaseCpp.toFixed(2)}¢ each: about{' '}
          <b className="tabular">{ptsRange(t.flight.chaseTravelPoints)} points</b> for the estimated {usdRange(t.flight.cash)} in fares.
          {card.pointsBoostMaxCpp ? ` Some flights show "Points Boost" at up to ${card.pointsBoostMaxCpp}¢ — then it can beat a transfer.` : ''} No transfer, no risk of stranded points.
        </p>
        <p className="mt-1 text-sm">
          Rule of thumb: only transfer if the award works out above your <b>{profile.minAcceptableCpp.toFixed(2)}¢</b> minimum (step 4 calculates this for you).{' '}
          <ExternalLink href="https://www.chase.com/personal/travel">Chase Travel (sign-in)</ExternalLink>
        </p>
      </Step>

      <HotelStep t={t} params={params} dates={dates} />
    </div>
  );
}

function Walkthrough({
  o,
  t,
  params,
  profile,
  dates,
  search,
  onRecord,
}: {
  o: ProgramOption;
  t: TripEstimate;
  params: SearchParams;
  profile: Profile;
  dates: { depart: string; ret: string };
  search: { url: string; prefilled: boolean };
  onRecord: () => void;
}) {
  const card = getCard(params.cardId);
  const travelers = Math.max(1, params.travelers);
  const [found, setFound] = useState<number | null>(null);
  const [taxes, setTaxes] = useState<number | null>(null);
  const [cash, setCash] = useState<number | null>(null);
  const [lastId, setLastId] = useState(o.partner.id);
  if (lastId !== o.partner.id) {
    setLastId(o.partner.id);
    setFound(null);
    setTaxes(null);
  }
  const vPct = o.verifiedBonus?.bonusPercent ?? 0;
  const plan = found ? planTransfer(found, o.ratio, vPct, o.partner.increment, o.partner.minTransfer) : null;
  const planIfReported = found && o.reportedBonus ? planTransfer(found, o.ratio, o.reportedBonus.bonusPercent, o.partner.increment, o.partner.minTransfer) : null;
  const value = plan && cash != null ? centsPerPoint(cash, taxes ?? 0, plan.chasePoints) : null;
  const verdict = judge(value, card.travelBaseCpp, profile.minAcceptableCpp);
  const estMid = Math.round(mid(o.chasePoints) / 1000) * 1000;
  const cur = o.guide.currency;
  const cabin = CABIN_WORD[params.cabin];

  return (
    <Step n={4} title={`Book with ${o.partner.name} ${cur} — step by step`}>
      <ol className="list-decimal space-y-2 pl-5 text-sm marker:font-semibold marker:text-brand-700">
        <li>
          <b>Get a free {o.partner.program} account</b> if you don’t have one: <ExternalLink href={o.partner.bookingUrl}>{o.partner.program}</ExternalLink>. You’ll need its member number to transfer.
        </li>
        <li>
          <b>Search for award seats first — before moving any points.</b>{' '}
          <ExternalLink href={search.url} className="font-semibold">
            {search.prefilled ? `Search ${t.origin.code} → ${t.destination.airports[0]} on these dates` : `Open ${o.partner.name}`}
          </ExternalLink>
          . {o.guide.searchHow}
          {!search.prefilled && (
            <span className="mt-1 block rounded-lg bg-slate-50 px-2 py-1 font-mono text-xs dark:bg-slate-800/60">
              {t.origin.code} → {t.destination.airports[0]} · {fmtDate(dates.depart)} – {fmtDate(dates.ret)} · {travelers} adult{travelers > 1 ? 's' : ''} · {cabin}
            </span>
          )}
        </li>
        <li>
          <b>Look for flights on {o.guide.books.slice(0, 3).join(', ')}</b>
          {o.guide.books.length > 3 ? ' or another partner' : ''}. Write down the total {cur} and taxes for all travelers. {o.guide.pricingNote}
        </li>
        <li>
          <b>Enter what you found</b> to see exactly how many Chase points to move and whether it’s worth it:
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <Field label={`Award price (${cur}, total)`} htmlFor="wk-found">
              <NumberInput id="wk-found" value={found} min={0} max={5_000_000} allowEmpty placeholder={`e.g. ${pts(mid(o.partnerPoints))}`} onChange={setFound} />
            </Field>
            <Field label="Award taxes & fees ($, total)" htmlFor="wk-tax">
              <NumberInput id="wk-tax" value={taxes} min={0} max={100_000} allowEmpty placeholder="e.g. 60" onChange={setTaxes} />
            </Field>
            <Field label="Cash price, same flights ($)" htmlFor="wk-cash" hint="From Google Flights in step 2">
              <NumberInput id="wk-cash" value={cash} min={0} max={1_000_000} allowEmpty placeholder={`est. ${usd(mid(t.flight.cash))}`} onChange={setCash} />
            </Field>
          </div>
          {plan ? (
            <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
              Transfer <b className="tabular">{pts(plan.chasePoints)} Chase points</b> → you receive <b className="tabular">{pts(plan.partnerPoints)} {cur}</b>
              {vPct ? ` (includes your verified +${vPct}% bonus — saves ${pts(plan.savedByBonus)} points)` : ''}
              {plan.leftover ? `; ${pts(plan.leftover)} left over` : ''}.
              {planIfReported && <div className="mt-1 text-amber-700 dark:text-amber-400">If the reported +{o.reportedBonus!.bonusPercent}% bonus shows on your Chase screen: only {pts(planIfReported.chasePoints)} Chase points.</div>}
              {profile.points < plan.chasePoints && <div className="mt-1 text-rose-600">That’s more than your {pts(profile.points)}-point balance.</div>}
              {cash != null && (
                <div className="mt-1">
                  <b>{verdict.headline}.</b> {verdict.detail}
                </div>
              )}
              {cash == null && <div className="mt-1 text-slate-500">Add the cash price to see the value per point.</div>}
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-500">
              Estimate before you search: roughly {ptsRange(o.partnerPoints)} {cur} ≈ {ptsRange(o.chasePoints)} Chase points. {o.basis}
            </p>
          )}
        </li>
        <li>
          <b>Transfer on Chase</b> (only once you’ve seen the seats): chase.com → Ultimate Rewards → <i>Transfer to travel partners</i> → {o.partner.name} → add your {o.partner.program} number →
          transfer <b className="tabular">{plan ? pts(plan.chasePoints) : `about ${pts(estMid)}`}</b> points.{' '}
          {o.verifiedBonus
            ? `Your +${o.verifiedBonus.bonusPercent}% bonus should show on that screen${o.verifiedBonus.endDate ? ` (ends ${fmtDate(o.verifiedBonus.endDate)})` : ''}.`
            : o.reportedBonus
              ? `A +${o.reportedBonus.bonusPercent}% bonus has been reported — check that it shows on that screen, then mark it Verified on the Transfer Bonuses page.`
              : 'No bonus recorded for this partner.'}{' '}
          Arrives: {o.partner.transferTime.toLowerCase()}.
          <div className="mt-1 flex items-start gap-1 text-xs text-rose-700 dark:text-rose-400">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Transfers can’t be undone, and PointPilot never transfers for you.
          </div>
        </li>
        <li>
          <b>Book right away</b> on {o.partner.name}’s site — award seats aren’t held while points move.
        </li>
        <li>
          <b>Record what you booked</b> so PointPilot replaces its estimate with your real numbers.{' '}
          <Button size="sm" onClick={onRecord}>
            <ClipboardPen className="h-3.5 w-3.5" /> Record a real quote
          </Button>
        </li>
      </ol>
      {o.guide.tips.length > 0 && (
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-slate-500">
          {o.guide.tips.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
        <ArrowRightLeft className="h-3 w-3" /> Ratio for your {card.name}: {formatRatio(o.ratio)} · min {pts(o.partner.minTransfer)}, steps of {pts(o.partner.increment)}
      </div>
    </Step>
  );
}

function HotelStep({ t, params, dates }: { t: TripEstimate; params: SearchParams; dates: { depart: string; ret: string } }) {
  const d = t.destination;
  const h = hotelLinks(d.name.split(/[,&]/)[0].trim(), dates.depart, dates.ret, params.travelers, t.rooms);
  const hyatt = h.find((l) => l.id === 'hyatt')!;
  const method = t.recommended.hotelMethod;
  return (
    <Step n={6} title="Hotel" icon={<Hotel className="h-4 w-4" />}>
      <p className="text-sm">
        Recommended: <b>{method === 'hyatt' ? 'World of Hyatt points' : method === 'chase-travel' ? 'Chase Travel points' : 'pay cash'}</b> for {t.nights} night{t.nights > 1 ? 's' : ''} ×{' '}
        {t.rooms} room{t.rooms > 1 ? 's' : ''} (est. {usdRange(t.hotel.cash)} cash
        {t.hotel.hyattPoints ? `, or ~${ptsRange(t.hotel.hyattPoints)} Chase points at Hyatt` : ''}).
      </p>
      <p className="mt-1 text-sm">
        {t.hotel.hyattPoints ? (
          <>
            Check <ExternalLink href={hyatt.url}>Hyatt award nights for these dates</ExternalLink>; if a standard room is available, transfer Chase → Hyatt the same way as step 4 (Hyatt transfers are
            usually instant) and book. Valued at {cpp(t.hotel.hyattCpp)}/pt against a comparable mid-range room.
          </>
        ) : (
          <>No Hyatt hotels are expected here, so Chase Travel or cash is usually simplest. Other hotel partners (IHG, Marriott, Wyndham) use dynamic pricing — compare their award price with cash first.</>
        )}
      </p>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {h.map((l) => (
          <ExternalLink key={l.id} href={l.url}>
            {l.label}
          </ExternalLink>
        ))}
      </p>
    </Step>
  );
}

function Step({ n, title, children, icon }: { n: number; title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 p-3 sm:p-4 dark:border-slate-800">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{n}</span>
        {title}
        {icon}
      </h3>
      {children}
    </section>
  );
}

