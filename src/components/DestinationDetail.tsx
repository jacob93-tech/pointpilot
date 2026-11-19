import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, BookmarkCheck, CalendarRange, ClipboardPen, Luggage, ShieldAlert } from 'lucide-react';
import type { TripEstimate } from '../engine/ranking';
import type { Profile, SearchParams } from '../lib/types';
import { flightLinks, hotelLinks, advisoryLink } from '../lib/links';
import { cpp, pts, ptsRange, usd, usdRange } from '../lib/format';
import { suggestDates } from '../engine/playbook';
import { mid } from '../engine/estimates';
import { getCard } from '../data/cards';
import { Badge, Button, ExternalLink, Modal, Notice, QualityBadge, ScoreBar, Tabs } from './ui';
import { BookingPlan } from './BookingPlan';
import { BonusPrice } from './BonusPrice';
import { DestinationImage, useWiki } from './DestinationCard';
import { createTripFromDestination } from '../lib/actions';
import { useToast } from './ui';

export { suggestDates };

export function DestinationDetail({ t, params, profile, onClose, saved, onToggleSave }: { t: TripEstimate | null; params: SearchParams; profile: Profile; onClose: () => void; saved: boolean; onToggleSave: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const initial = useMemo(() => (t ? suggestDates(params, t.days) : { depart: '', ret: '' }), [t, params]);
  const [dates, setDates] = useState(initial);
  const [tab, setTab] = useState<'book' | 'overview'>('book');
  const [lastT, setLastT] = useState(t);
  if (t !== lastT) { setLastT(t); setDates(initial); if (t?.destination.id !== lastT?.destination.id) setTab('book'); }
  const wiki = useWiki(t?.destination.wikiTitle);
  if (!t) return null;
  const d = t.destination;
  const card = getCard(params.cardId);
  const destAirport = d.airports[0];
  const links = flightLinks({ origin: params.airports.map((a) => a.code).join(','), dest: destAirport, depart: dates.depart, ret: dates.ret, travelers: params.travelers, cabin: params.cabin }, { flexible: params.dateMode !== 'specific' });
  const bestOriginLinks = flightLinks({ origin: t.origin.code, dest: destAirport, depart: dates.depart, ret: dates.ret, travelers: params.travelers, cabin: params.cabin });
  const hLinks = hotelLinks(d.name.split(/[,&]/)[0].trim(), dates.depart, dates.ret, params.travelers, t.rooms);
  const boostPts = card.pointsBoostMaxCpp ? Math.ceil((mid(t.flight.cash) * 100) / profile.pointsBoostCpp) : null;

  return (
    <Modal open={!!t} onClose={onClose} title={d.name} wide>
      <div className="mb-4">
        <Tabs tabs={[{ id: 'book', label: 'How to book with points' }, { id: 'overview', label: 'Overview & costs' }]} value={tab} onChange={setTab} />
      </div>
      {tab === 'book' && <BookingPlan t={t} params={params} profile={profile} dates={dates} setDates={setDates} />}
      <div className={tab === 'overview' ? 'grid gap-5 lg:grid-cols-[1fr_320px]' : 'hidden'}>
        <div className="space-y-5">
          <div className="overflow-hidden rounded-xl">
            <DestinationImage title={d.wikiTitle} alt={d.name} className="h-48 w-full sm:h-60" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {d.blurb}{' '}
            {wiki?.pageUrl && (
              <span className="text-xs">
                Photo & info: <ExternalLink href={wiki.pageUrl}>Wikipedia / Wikimedia Commons</ExternalLink>
              </span>
            )}
          </p>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Why it ranks here</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {t.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {t.flags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {t.flags.map((f) => (
                  <Badge key={f} tone="amber">{f}</Badge>
                ))}
              </div>
            )}
          </section>

          <BonusPrice t={t} />

          <section>
            <h3 className="mb-2 text-sm font-semibold">How to pay — four strategies compared</h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/60">
                  <tr>
                    <th className="px-3 py-2">Strategy</th>
                    <th className="px-3 py-2 text-right">Cash (est.)</th>
                    <th className="px-3 py-2 text-right">Chase pts (est.)</th>
                    <th className="px-3 py-2 text-right">Value/pt</th>
                    <th className="px-3 py-2">Fits?</th>
                  </tr>
                </thead>
                <tbody>
                  {t.strategies.map((s) => (
                    <tr key={s.id} className={s.id === t.recommended.id ? 'bg-brand-50 dark:bg-brand-900/30' : 'border-t border-slate-100 dark:border-slate-800'}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{s.label}</div>
                        <div className="text-[11px] text-slate-500">
                          Flights: {s.flightMethod === 'award' ? 'partner award' : s.flightMethod === 'chase-travel' ? 'Chase Travel' : 'cash'} · Hotel: {s.hotelMethod === 'hyatt' ? 'World of Hyatt' : s.hotelMethod === 'chase-travel' ? 'Chase Travel' : 'cash'}
                        </div>
                        {s.id === t.recommended.id && <Badge tone="brand">Recommended</Badge>}
                      </td>
                      <td className="tabular px-3 py-2 text-right">{usdRange(s.cashRange)}</td>
                      <td className="tabular px-3 py-2 text-right">
                        {s.points ? ptsRange(s.pointsRangeNoBonus) : '—'}
                        {s.flightMethod === 'award' && t.flight.awardProgram && (
                          <div className="mt-0.5 inline-block rounded-full bg-gradient-to-r from-fuchsia-600 via-pink-500 to-orange-400 px-2 py-0.5 text-[11px] font-bold text-white">
                            ✨ {ptsRange(s.pointsRange)} w/ bonus
                          </div>
                        )}
                      </td>
                      <td className="tabular px-3 py-2 text-right">{cpp(s.cpp)}</td>
                      <td className="px-3 py-2 text-xs">
                        {s.withinBudget ? <span className="text-emerald-600">Budget ✓</span> : <span className="text-rose-600">Over budget</span>}
                        <br />
                        {s.withinPoints ? <span className="text-emerald-600">Points ✓</span> : <span className="text-rose-600">Not enough pts</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Recommended = the mix within your cash and points limits with the most cash saved after charging each point at your {profile.minAcceptableCpp.toFixed(2)}¢ minimum. Using more points isn’t automatically better.
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Cost breakdown</h3>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <Row label={`Flights (${params.travelers} traveler${params.travelers > 1 ? 's' : ''}, round trip)`} q={t.flight.quality} value={usdRange(t.flight.cash)} note={t.flight.note} />
              <Row
                label="Award (typical saver range)"
                q={t.flight.quality}
                value={t.flight.awardPoints ? `${ptsRange(t.flight.awardPoints)} pts + ${usdRange(t.flight.awardFees)}` : 'Transfers not available on this card'}
                note={t.flight.awardCpp != null ? `≈${t.flight.awardCpp.toFixed(2)}¢/pt at midpoints. ${t.flight.awardProgram ? `Includes your verified +${t.flight.awardProgram.bonusPercent}% ${t.flight.awardProgram.name} bonus (${ptsRange(t.flight.awardProgram.pointsNoBonus)} without it).` : 'No verified transfer bonus applied.'}` : undefined}
              />
              <Row label={`Chase Travel at ${card.travelBaseCpp.toFixed(2)}¢`} q="estimate" value={`${ptsRange(t.flight.chaseTravelPoints)} pts`} note={boostPts ? `If Points Boost at ${profile.pointsBoostCpp.toFixed(2)}¢ shows for a booking: ~${pts(boostPts)} pts. Only select bookings qualify.` : undefined} />
              <Row label={`Hotel (${t.nights} nights × ${t.rooms} room)`} q={t.hotel.quality} value={usdRange(t.hotel.cash)} note={t.hotel.note} />
              {t.hotel.hyattPoints && <Row label="World of Hyatt (approx. categories)" q="estimate" value={`${ptsRange(t.hotel.hyattPoints)} Chase pts`} note={`Card ratio applied. Valued against a comparable mid-range room ≈${cpp(t.hotel.hyattCpp)}/pt.`} />}
              <Row label={`Food, local transport, activities (${t.days} days)`} q="estimate" value={usdRange(t.onTheGround)} />
              {t.groundToAirport > 0 && <Row label={`Getting to ${t.origin.code}`} q="user" value={usd(t.groundToAirport)} />}
              <Row label="All-cash trip total" q={t.estimateOnly ? 'estimate' : 'user'} value={usdRange(t.allCash)} />
            </dl>
            {t.originNote && <p className="mt-2 text-xs text-slate-500">{t.originNote}</p>}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-semibold">Overall score</span>
              <span className="tabular text-2xl font-bold text-brand-700 dark:text-brand-300">{t.overall}</span>
            </div>
            <div className="space-y-2">
              <ScoreBar label="Points redemption value" value={t.scores.pointsValue} />
              <ScoreBar label="Cash affordability" value={t.scores.affordability} />
              <ScoreBar label="Travel convenience" value={t.scores.convenience} />
              <ScoreBar label="Destination experiences" value={t.scores.experiences} hint="Editorial rating" />
              <ScoreBar label="Weather suitability" value={t.scores.weather} />
              <ScoreBar label="Personal preference match" value={t.scores.preference} />
            </div>
            <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
              Weather: <QualityBadge q={t.weatherInfo.quality} />
            </div>
          </div>

          <div className="space-y-2">
            <Button variant="primary" className="w-full" onClick={async () => {
              const id = await createTripFromDestination(d, dates.depart, dates.ret, params, t);
              toast('Trip created', 'success');
              nav(`/trips/${id}`);
            }}>
              <Luggage className="h-4 w-4" /> Save as a new trip
            </Button>
            <Button className="w-full" onClick={onToggleSave}>
              {saved ? <BookmarkCheck className="h-4 w-4 text-brand-600" /> : <Bookmark className="h-4 w-4" />} {saved ? 'Saved destination' : 'Save destination'}
            </Button>
            <Button className="w-full" onClick={() => nav(`/flights?tab=compare&new=1&dest=${d.id}&origin=${t.origin.code}&to=${destAirport}&depart=${dates.depart}&ret=${dates.ret}&trav=${params.travelers}&cabin=${params.cabin}`)}>
              <ClipboardPen className="h-4 w-4" /> Record a real flight quote
            </Button>
            <Button className="w-full" onClick={() => nav(`/flights?tab=flex&dest=${d.id}`)}>
              <CalendarRange className="h-4 w-4" /> Compare flexible dates
            </Button>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <h3 className="mb-2 text-sm font-semibold">Research links</h3>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <label className="text-[11px] text-slate-500">
                Depart
                <input type="date" value={dates.depart} onChange={(e) => setDates({ ...dates, depart: e.target.value })} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950" />
              </label>
              <label className="text-[11px] text-slate-500">
                Return
                <input type="date" value={dates.ret} min={dates.depart} onChange={(e) => setDates({ ...dates, ret: e.target.value })} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950" />
              </label>
            </div>
            <Notice className="mb-2 text-xs">Links open real searches. They don’t confirm prices or award availability.</Notice>
            <LinkList title="Cash fares" links={links.filter((l) => l.kind === 'cash')} />
            <LinkList title={`Award searches (from ${t.origin.code})`} links={bestOriginLinks.filter((l) => l.kind === 'award')} />
            <LinkList title="Portal" links={bestOriginLinks.filter((l) => l.kind === 'portal')} />
            <LinkList title="Hotels" links={hLinks} />
          </div>

          {!d.domestic && (
            <div className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
              <div className="mb-1 flex items-center gap-1 font-semibold">
                <ShieldAlert className="h-4 w-4" /> Travel advisory
              </div>
              {d.advisoryLevel ? <>Last-known level: <b>{d.advisoryLevel}</b> (developer-seeded; may be outdated). </> : <>No seeded level. </>}
              <ExternalLink href={advisoryLink(d.advisorySlug)}>Check travel.state.gov</ExternalLink>
            </div>
          )}
        </aside>
      </div>
    </Modal>
  );
}

function Row({ label, value, q, note }: { label: string; value: string; q: Parameters<typeof QualityBadge>[0]['q']; note?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50">
      <dt className="flex items-center justify-between gap-2 text-xs text-slate-500">
        {label} <QualityBadge q={q} />
      </dt>
      <dd className="tabular mt-0.5 font-semibold">{value}</dd>
      {note && <dd className="mt-0.5 text-[11px] text-slate-500">{note}</dd>}
    </div>
  );
}

function LinkList({ title, links }: { title: string; links: ReturnType<typeof flightLinks> }) {
  if (!links.length) return null;
  return (
    <div className="mb-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <ul className="mt-1 space-y-1 text-sm">
        {links.map((l) => (
          <li key={l.id}>
            <ExternalLink href={l.url}>{l.label}</ExternalLink>
            {!l.prefilled && <span className="ml-1 text-[10px] text-slate-500">(enter details on site)</span>}
            {l.note && <div className="text-[11px] text-slate-500">{l.note}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
