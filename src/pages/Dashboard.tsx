import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Bookmark, CalendarClock, Gift, Luggage, Plane, Search } from 'lucide-react';
import { db } from '../lib/db';
import { useLastSearch, useProfile, useToday } from '../lib/hooks';
import { useRanking } from '../lib/useRanking';
import { SearchForm } from '../components/SearchForm';
import { DestinationCard } from '../components/DestinationCard';
import { DestinationDetail } from '../components/DestinationDetail';
import { Badge, BonusBadge, Card, EmptyState, QualityBadge, Stat, useToast } from '../components/ui';
import { getCard } from '../data/cards';
import { getDestination } from '../data/destinations';
import { bonusState } from '../engine/transfer';
import { summarizeComparison } from '../engine/redemption';
import { fmtDate, pts, relTime, usd } from '../lib/format';
import { monthName, type TripEstimate } from '../engine/ranking';
import { toggleSavedDestination } from '../lib/actions';
import type { SearchParams } from '../lib/types';

export function Dashboard() {
  const profile = useProfile();
  const today = useToday();
  const nav = useNavigate();
  const toast = useToast();
  const [saved, save] = useLastSearch(profile);
  const [draft, setDraft] = useState<SearchParams | null>(null);
  const form = draft ?? saved;
  const { result } = useRanking(saved, profile, false);
  const [open, setOpen] = useState<TripEstimate | null>(null);

  const bonuses = useLiveQuery(() => db.bonuses.toArray(), []) ?? [];
  const partners = useLiveQuery(() => db.partners.toArray(), []) ?? [];
  const trips = useLiveQuery(() => db.trips.orderBy('startDate').toArray(), []) ?? [];
  const comps = useLiveQuery(() => db.comparisons.orderBy('updatedAt').reverse().limit(5).toArray(), []) ?? [];
  const searches = useLiveQuery(() => db.savedSearches.orderBy('createdAt').reverse().limit(5).toArray(), []) ?? [];
  const savedDest = useLiveQuery(() => db.savedDestinations.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const lastSearchAt = useLiveQuery(() => db.meta.get('lastSearchAt'), [])?.value as string | undefined;
  const savedIds = useMemo(() => new Set(savedDest.map((s) => s.id)), [savedDest]);

  const states = bonuses.map((b) => ({ b, s: bonusState(b, today, profile.bonusVerifyWindowDays) }));
  const verified = states.filter((x) => x.s === 'verified-active');
  const unverified = states.filter((x) => x.s === 'needs-verification');
  const upcomingTrips = trips.filter((t) => !t.endDate || t.endDate >= today);
  const partnerName = (id: string) => partners.find((p) => p.id === id)?.name ?? id;
  const lastPartnerCheck = partners.map((p) => p.userVerifiedAt).filter(Boolean).sort().pop();
  const card = getCard(profile.cardId);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-sky-700 p-5 text-white shadow-lg sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl">Where can my Chase points take me?</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">
          Enter your points, airports, month and budget. PointPilot ranks real-world-practical trips and shows whether points or cash is the smarter way to pay.
        </p>
        <div className="mt-5 rounded-2xl bg-white p-4 text-slate-900 shadow-xl sm:p-5 dark:bg-slate-900 dark:text-slate-100">
          <SearchForm
            compact
            value={form}
            onChange={setDraft}
            onSubmit={async () => {
              await save(form);
              setDraft(null);
              nav('/explore');
            }}
          />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card>
          <Stat label="Available Chase points" value={pts(profile.points)} sub={<Link className="text-brand-700 dark:text-brand-300" to="/settings">Edit balance</Link>} />
        </Card>
        <Card>
          <Stat label="Card" value={<span className="text-base">{card.name}</span>} sub={card.transferEligible ? 'Transfers to partners enabled' : 'No partner transfers on this card'} />
        </Card>
        <Card>
          <Stat label="Departure airports" value={profile.airports.map((a) => a.code).join(' · ')} sub={`Home: ${profile.airports.find((a) => a.isHome)?.code ?? '—'}`} />
        </Card>
        <Card>
          <Stat label="Your minimum value" value={`${profile.minAcceptableCpp.toFixed(2)}¢/pt`} sub="Used to decide points vs cash" />
        </Card>
      </div>

      <Card
        title="Recommended destinations"
        subtitle={`For your last search: ${pts(saved.points)} pts · ${monthName(saved.month)} ${saved.year} · ${saved.minDays}–${saved.maxDays} days · ≤${usd(saved.maxCash)}${lastSearchAt ? ` · searched ${relTime(lastSearchAt)}` : ''}`}
        action={<Link to="/explore" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 dark:text-brand-300">All results <ArrowRight className="h-4 w-4" /></Link>}
      >
        <p className="mb-3 flex items-center gap-1.5 text-xs text-slate-500">
          <QualityBadge q="estimate" /> Rankings use estimates and general climate guidance here; open Explore for observed weather data. These aren't deals or offers.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {result.results.slice(0, 3).map((t, i) => (
            <DestinationCard key={t.destination.id} t={t} rank={i + 1} onOpen={() => setOpen(t)} saved={savedIds.has(t.destination.id)} onToggleSave={async () => toast((await toggleSavedDestination(t.destination.id)) ? 'Saved' : 'Removed', 'info')} />
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={<span className="inline-flex items-center gap-2"><Gift className="h-4 w-4" /> Verified active transfer bonuses</span>}
          action={<Link to="/bonuses" className="text-sm font-medium text-brand-700 dark:text-brand-300">Manage</Link>}
          subtitle={`Partner ratios last confirmed by you: ${lastPartnerCheck ? relTime(lastPartnerCheck) : 'never'}`}
        >
          {verified.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              None verified. {unverified.length > 0 && <>There {unverified.length === 1 ? 'is' : 'are'} <b>{unverified.length}</b> reported bonus{unverified.length === 1 ? '' : 'es'} waiting for you to confirm on Chase’s transfer screen.</>}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {verified.map(({ b, s }) => (
                <li key={b.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <b>{b.bonusPercent}%</b> to {partnerName(b.partnerId)} <span className="text-xs text-slate-500">· ends {fmtDate(b.endDate)}</span>
                  </span>
                  <BonusBadge state={s} targeted={b.targeted} />
                </li>
              ))}
            </ul>
          )}
          {unverified.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {unverified.map(({ b }) => (
                <Badge key={b.id} tone="amber">
                  {b.bonusPercent}% {partnerName(b.partnerId)} (unverified)
                </Badge>
              ))}
            </div>
          )}
        </Card>

        <Card title={<span className="inline-flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Upcoming trips</span>} action={<Link to="/trips" className="text-sm font-medium text-brand-700 dark:text-brand-300">All trips</Link>}>
          {upcomingTrips.length === 0 ? (
            <EmptyState icon={<Luggage className="h-6 w-6" />} title="No trips yet">Open a destination and choose “Save as a new trip”.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {upcomingTrips.slice(0, 5).map((t) => (
                <li key={t.id}>
                  <Link to={`/trips/${t.id}`} className="flex items-center justify-between py-2 text-sm hover:text-brand-700">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-xs text-slate-500">{fmtDate(t.startDate)} – {fmtDate(t.endDate)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={<span className="inline-flex items-center gap-2"><Plane className="h-4 w-4" /> Saved flight comparisons</span>} action={<Link to="/flights" className="text-sm font-medium text-brand-700 dark:text-brand-300">Flights & Points</Link>}>
          {comps.length === 0 ? (
            <p className="text-sm text-slate-500">No comparisons yet. Record real cash and award prices you find to compare redemption options.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {comps.map((c) => {
                const s = summarizeComparison(c, { cardId: profile.cardId, balance: profile.points, minAcceptableCpp: profile.minAcceptableCpp, partners, bonuses, verifyWindowDays: profile.bonusVerifyWindowDays });
                return (
                  <li key={c.id} className="py-2 text-sm">
                    <Link to={`/flights?tab=compare&id=${c.id}`} className="flex items-center justify-between gap-2 hover:text-brand-700">
                      <span className="truncate font-medium">{c.title}</span>
                      <span className="shrink-0 text-xs">{s.payCash ? <Badge tone="slate">Pay cash</Badge> : s.best ? <Badge tone="green">{s.best.cpp!.toFixed(2)}¢/pt</Badge> : <Badge>Incomplete</Badge>}</span>
                    </Link>
                    <div className="text-[11px] text-slate-500">Cash price verified {c.cashVerifiedAt ? fmtDate(c.cashVerifiedAt) : 'date not recorded'} · {c.cashSource || 'source not recorded'}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={<span className="inline-flex items-center gap-2"><Bookmark className="h-4 w-4" /> Saved destinations & searches</span>}>
          {savedDest.length === 0 && searches.length === 0 && <p className="text-sm text-slate-500">Bookmark destinations and save searches from Explore.</p>}
          {savedDest.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {savedDest.map((s) => (
                <Link key={s.id} to={`/explore?dest=${s.id}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium hover:bg-brand-100 dark:bg-slate-800">
                  {getDestination(s.id)?.name ?? s.id}
                </Link>
              ))}
            </div>
          )}
          {searches.length > 0 && (
            <ul className="space-y-1">
              {searches.map((s) => (
                <li key={s.id}>
                  <button
                    className="inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline dark:text-brand-300"
                    onClick={async () => {
                      await save(s.params);
                      nav('/explore');
                    }}
                  >
                    <Search className="h-3.5 w-3.5" /> {s.name}
                  </button>
                  <span className="ml-2 text-[11px] text-slate-500">{relTime(s.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <DestinationDetail t={open} params={saved} profile={profile} onClose={() => setOpen(null)} saved={!!open && savedIds.has(open.destination.id)} onToggleSave={() => open && toggleSavedDestination(open.destination.id)} />
    </div>
  );
}
