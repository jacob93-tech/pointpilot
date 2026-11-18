import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, Plus, Save, Trash2 } from 'lucide-react';
import type { Availability, Cabin, Comparison, RedemptionOption } from '../lib/types';
import { db, nowISO, uid } from '../lib/db';
import { useProfile, useToday } from '../lib/hooks';
import { summarizeComparison, availabilityLabel } from '../engine/redemption';
import { DESTINATIONS } from '../data/destinations';
import { getCard } from '../data/cards';
import { flightLinks, hotelLinks } from '../lib/links';
import { sanitizeUrl } from '../lib/gmaps';
import { cpp, fmtDate, pts, usd } from '../lib/format';
import { Badge, Button, Card, EmptyState, ExternalLink, Field, Input, Notice, NumberInput, QualityBadge, Select, TextArea, useToast } from './ui';
import { CABINS } from './SearchForm';
import { ClipboardList } from 'lucide-react';

export function blankComparison(over: Partial<Comparison> = {}): Comparison {
  const now = nowISO();
  return {
    id: '', title: '', kind: 'flight', travelers: 1, cabin: 'economy', cashPrice: null, cashSource: '', options: [], createdAt: now, updatedAt: now, ...over,
  };
}

export function ComparisonsTab({ initial }: { initial?: Partial<Comparison> & { openId?: string } }) {
  const list = useLiveQuery(() => db.comparisons.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const [current, setCurrent] = useState<Comparison | null>(null);
  const profile = useProfile();
  const partners = useLiveQuery(() => db.partners.toArray(), []) ?? [];
  const bonuses = useLiveQuery(() => db.bonuses.toArray(), []) ?? [];

  useEffect(() => {
    if (!initial) return;
    if (initial.openId) {
      db.comparisons.get(initial.openId).then((c) => c && setCurrent(c));
    } else {
      const { openId: _o, ...rest } = initial;
      void _o;
      setCurrent(blankComparison(rest));
    }
  }, [initial]);

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
      <div className="space-y-3">
        <Button variant="primary" className="w-full" onClick={() => setCurrent(blankComparison({ travelers: profile.travelers, origin: profile.airports[0]?.code }))}>
          <Plus className="h-4 w-4" /> New comparison
        </Button>
        {list.length === 0 && <p className="text-sm text-slate-500">No saved comparisons yet.</p>}
        <ul className="space-y-2">
          {list.map((c) => {
            const s = summarizeComparison(c, { cardId: profile.cardId, balance: profile.points, minAcceptableCpp: profile.minAcceptableCpp, partners, bonuses, verifyWindowDays: profile.bonusVerifyWindowDays });
            return (
              <li key={c.id}>
                <button
                  onClick={() => setCurrent(c)}
                  className={`w-full rounded-xl border p-3 text-left text-sm transition-colors ${current?.id === c.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 bg-white hover:border-brand-300 dark:border-slate-800 dark:bg-slate-900'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{c.title || 'Untitled'}</span>
                    {s.payCash ? <Badge>Pay cash</Badge> : s.best ? <Badge tone="green">{cpp(s.best.cpp)}</Badge> : <Badge tone="amber">Incomplete</Badge>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {c.kind === 'flight' ? `${c.origin ?? '?'} → ${c.destination ?? '?'}` : 'Hotel'} · {fmtDate(c.departDate)} · {c.cashPrice != null ? usd(c.cashPrice) : 'no cash price'}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {current ? (
        <ComparisonEditor key={current.id || 'new'} value={current} onSaved={setCurrent} onDeleted={() => setCurrent(null)} />
      ) : (
        <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Compare cash vs points with real prices">
          Find a fare on Google Flights and award prices on partner sites, then record them here with their source and date. PointPilot computes Chase points needed (with verified bonuses), value per point, and whether paying cash is better.
        </EmptyState>
      )}
    </div>
  );
}

function ComparisonEditor({ value, onSaved, onDeleted }: { value: Comparison; onSaved: (c: Comparison) => void; onDeleted: () => void }) {
  const [c, setC] = useState<Comparison>(value);
  const [extra, setExtra] = useState<number | null>(0);
  const profile = useProfile();
  const today = useToday();
  const toast = useToast();
  const partners = (useLiveQuery(() => db.partners.toArray(), []) ?? []).filter((p) => p.active);
  const bonuses = useLiveQuery(() => db.bonuses.toArray(), []) ?? [];
  const relevant = partners.filter((p) => (c.kind === 'flight' ? p.type === 'airline' : p.type === 'hotel'));
  const card = getCard(profile.cardId);
  const ctx = { cardId: profile.cardId, balance: profile.points, minAcceptableCpp: profile.minAcceptableCpp, partners, bonuses, verifyWindowDays: profile.bonusVerifyWindowDays, additionalCosts: extra ?? 0 };
  const summary = useMemo(() => summarizeComparison(c, ctx), [c, ctx.balance, ctx.cardId, ctx.minAcceptableCpp, partners, bonuses, extra]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof Comparison>(k: K, v: Comparison[K]) => setC((x) => ({ ...x, [k]: v }));
  const setOpt = (id: string, patch: Partial<RedemptionOption>) => setC((x) => ({ ...x, options: x.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  const urlOk = !c.cashUrl || !!sanitizeUrl(c.cashUrl);

  const saveIt = async () => {
    if (!urlOk) return;
    const title = c.title.trim() || (c.kind === 'flight' ? `${c.origin ?? ''} → ${c.destination ?? ''} ${c.departDate ?? ''}`.trim() : `Hotel ${c.departDate ?? ''}`.trim());
    const next = { ...c, title, id: c.id || uid(), updatedAt: nowISO(), cashUrl: sanitizeUrl(c.cashUrl) };
    await db.comparisons.put(next);
    setC(next);
    onSaved(next);
    toast('Comparison saved', 'success');
  };

  const links = c.kind === 'flight' && c.origin && c.destination && c.departDate
    ? flightLinks({ origin: c.origin, dest: c.destination, depart: c.departDate, ret: c.returnDate, travelers: c.travelers, cabin: c.cabin ?? 'economy' })
    : c.kind === 'hotel' && c.destinationId
      ? hotelLinks(DESTINATIONS.find((d) => d.id === c.destinationId)?.name.split(/[,&]/)[0] ?? '', c.departDate, c.returnDate, c.travelers)
      : [];

  return (
    <div className="space-y-4">
      <Card title={c.id ? 'Edit comparison' : 'New comparison'} subtitle="All amounts are totals for all travelers. The cash price must be for a genuinely comparable itinerary (same flights/cabin or same hotel room) and include taxes.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Title" htmlFor="ce-t" className="sm:col-span-2"><Input id="ce-t" value={c.title} maxLength={100} placeholder="e.g. SAN–HNL April, nonstop" onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="Type" htmlFor="ce-k">
            <Select id="ce-k" value={c.kind} onChange={(e) => set('kind', e.target.value as Comparison['kind'])}>
              <option value="flight">Flight</option>
              <option value="hotel">Hotel</option>
            </Select>
          </Field>
          <Field label="Destination (links it to rankings)" htmlFor="ce-d">
            <Select id="ce-d" value={c.destinationId ?? ''} onChange={(e) => set('destinationId', e.target.value || undefined)}>
              <option value="">— none —</option>
              {DESTINATIONS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          {c.kind === 'flight' && (
            <>
              <Field label="From (airport)" htmlFor="ce-o"><Input id="ce-o" value={c.origin ?? ''} maxLength={3} onChange={(e) => set('origin', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} /></Field>
              <Field label="To (airport)" htmlFor="ce-to"><Input id="ce-to" value={c.destination ?? ''} maxLength={3} onChange={(e) => set('destination', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} /></Field>
              <Field label="Cabin" htmlFor="ce-cab">
                <Select id="ce-cab" value={c.cabin ?? 'economy'} onChange={(e) => set('cabin', e.target.value as Cabin)}>
                  {CABINS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </Select>
              </Field>
            </>
          )}
          <Field label="Travelers" htmlFor="ce-tr"><NumberInput id="ce-tr" value={c.travelers} min={1} max={9} step={1} onChange={(v) => set('travelers', v ?? 1)} /></Field>
          <Field label={c.kind === 'flight' ? 'Depart' : 'Check-in'} htmlFor="ce-dd"><Input id="ce-dd" type="date" value={c.departDate ?? ''} onChange={(e) => set('departDate', e.target.value || undefined)} /></Field>
          <Field label={c.kind === 'flight' ? 'Return (optional)' : 'Check-out'} htmlFor="ce-rd"><Input id="ce-rd" type="date" min={c.departDate} value={c.returnDate ?? ''} onChange={(e) => set('returnDate', e.target.value || undefined)} /></Field>
        </div>
      </Card>

      <Card title="Cash option" action={<QualityBadge q="user" />}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Cash price, taxes included (total)" htmlFor="ce-cp" hint="Leave empty if you haven't found one.">
            <NumberInput id="ce-cp" value={c.cashPrice} min={0} max={1_000_000} allowEmpty placeholder="e.g. 612.40" onChange={(v) => set('cashPrice', v)} />
          </Field>
          <Field label="Source" htmlFor="ce-cs"><Input id="ce-cs" value={c.cashSource} maxLength={80} placeholder="Google Flights, airline site…" onChange={(e) => set('cashSource', e.target.value)} /></Field>
          <Field label="Price checked on" htmlFor="ce-cv"><Input id="ce-cv" type="date" max={today} value={c.cashVerifiedAt?.slice(0, 10) ?? ''} onChange={(e) => set('cashVerifiedAt', e.target.value || undefined)} /></Field>
          <Field label="Link (optional)" htmlFor="ce-cu"><Input id="ce-cu" value={c.cashUrl ?? ''} placeholder="https://…" onChange={(e) => set('cashUrl', e.target.value)} /></Field>
          <Field label="Extra cash the award forces (optional)" htmlFor="ce-x" hint="e.g. a positioning flight or bag fees the cash fare includes.">
            <NumberInput id="ce-x" value={extra} min={0} max={100000} allowEmpty onChange={setExtra} />
          </Field>
        </div>
        {!urlOk && <p className="mt-2 text-sm text-rose-600">Link must start with http(s)://</p>}
        {c.cashVerifiedAt && c.cashVerifiedAt.slice(0, 10) < today && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Cash price recorded {fmtDate(c.cashVerifiedAt)} — prices change; recheck before deciding.</p>
        )}
      </Card>

      <Card
        title="Points options"
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => set('options', [...c.options, { id: uid(), method: 'transfer', partnerId: relevant[0]?.id, partnerPoints: undefined, taxesFees: c.kind === 'flight' ? 11.2 * c.travelers : 0, availability: 'not-checked', source: '' }])}>
              <Plus className="h-3.5 w-3.5" /> Transfer partner
            </Button>
            <Button size="sm" onClick={() => set('options', [...c.options, { id: uid(), method: 'chase-travel', chaseTravelPoints: c.cashPrice ? Math.ceil((c.cashPrice * 100) / card.travelBaseCpp) : undefined, taxesFees: 0, availability: 'seen-available', source: 'Chase Travel' }])}>
              <Plus className="h-3.5 w-3.5" /> Chase Travel
            </Button>
          </div>
        }
      >
        {c.options.length === 0 && <p className="text-sm text-slate-500">Add the award prices you found. Paying cash is always compared automatically.</p>}
        <div className="space-y-3">
          {c.options.map((o) => {
            const ev = summary.evaluated.find((e) => e.option.id === o.id);
            return (
              <div key={o.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                  {o.method === 'transfer' ? (
                    <>
                      <Field label="Partner" htmlFor={`p-${o.id}`} className="xl:col-span-2">
                        <Select id={`p-${o.id}`} value={o.partnerId} onChange={(e) => setOpt(o.id, { partnerId: e.target.value })}>
                          {relevant.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.program}</option>)}
                        </Select>
                      </Field>
                      <Field label="Partner points (total)" htmlFor={`pp-${o.id}`}><NumberInput id={`pp-${o.id}`} value={o.partnerPoints ?? null} allowEmpty min={0} max={10_000_000} step={1} onChange={(v) => setOpt(o.id, { partnerPoints: v ?? undefined })} /></Field>
                    </>
                  ) : (
                    <Field label="Chase Travel points (total)" htmlFor={`ct-${o.id}`} className="xl:col-span-3" hint={`At ${card.travelBaseCpp}¢ base. If the booking shows Points Boost, enter the boosted points price.`}>
                      <NumberInput id={`ct-${o.id}`} value={o.chaseTravelPoints ?? null} allowEmpty min={0} max={10_000_000} step={1} onChange={(v) => setOpt(o.id, { chaseTravelPoints: v ?? undefined })} />
                    </Field>
                  )}
                  <Field label="Cash taxes & fees" htmlFor={`tf-${o.id}`}><NumberInput id={`tf-${o.id}`} value={o.taxesFees} min={0} max={100000} onChange={(v) => setOpt(o.id, { taxesFees: v ?? 0 })} /></Field>
                  <Field label="Availability" htmlFor={`av-${o.id}`}>
                    <Select id={`av-${o.id}`} value={o.availability} onChange={(e) => setOpt(o.id, { availability: e.target.value as Availability, verifiedAt: e.target.value === 'seen-available' ? nowISO() : o.verifiedAt })}>
                      {(['seen-available', 'not-checked', 'unavailable'] as Availability[]).map((a) => <option key={a} value={a}>{availabilityLabel(a)}</option>)}
                    </Select>
                  </Field>
                  <Field label="Source / notes" htmlFor={`src-${o.id}`}><Input id={`src-${o.id}`} value={o.source} maxLength={120} onChange={(e) => setOpt(o.id, { source: e.target.value })} /></Field>
                </div>
                {ev && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                    <span>Chase points: <b className="tabular">{pts(ev.chasePoints)}</b>{ev.bonus && <Badge tone="green" className="ml-1">+{ev.bonus.bonusPercent}% verified bonus</Badge>}</span>
                    <span>Cash: <b className="tabular">{usd(ev.cashOutOfPocket, 2)}</b></span>
                    <span>Value: <b className="tabular">{cpp(ev.cpp)}/pt</b></span>
                    <span>Saves: <b className="tabular">{ev.cashSaved != null ? usd(ev.cashSaved, 2) : '—'}</b></span>
                    <span>Balance after: <b className="tabular">{pts(ev.remainingPoints)}</b></span>
                    <Badge tone={ev.verdict.verdict === 'excellent' || ev.verdict.verdict === 'good' ? 'green' : ev.verdict.verdict === 'unknown' ? 'slate' : 'amber'}>{ev.verdict.headline}</Badge>
                    {o.verifiedAt && <span className="text-[11px] text-slate-500">Availability seen {fmtDate(o.verifiedAt)}</span>}
                  </div>
                )}
                {ev?.planIfReportedBonus && ev.unverifiedBonus && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    If the reported (unverified) {ev.unverifiedBonus.bonusPercent}% bonus is real: {pts(ev.planIfReportedBonus.chasePoints)} Chase points. Verify it on Chase before relying on it.
                  </p>
                )}
                {ev?.warnings.map((w) => <p key={w} className="mt-1 text-xs text-rose-600 dark:text-rose-400">⚠ {w}</p>)}
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="ghost" onClick={() => set('options', c.options.filter((x) => x.id !== o.id))}><Trash2 className="h-3.5 w-3.5" /> Remove</Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Notice tone={summary.payCash ? 'info' : summary.best ? 'success' : 'warn'} title="Recommendation">
        {summary.recommendation}
        {summary.best && !summary.payCash && (
          <div className="mt-1 text-xs">Opportunity cost: these points are worth ≈{usd(((summary.best.chasePoints ?? 0) * profile.minAcceptableCpp) / 100)} at your {profile.minAcceptableCpp.toFixed(2)}¢ minimum vs. {usd(summary.best.cashSaved ?? 0)} cash saved.</div>
        )}
      </Notice>

      <Card title="Notes"><TextArea value={c.notes ?? ''} maxLength={2000} onChange={(e) => set('notes', e.target.value)} /></Card>

      {links.length > 0 && (
        <Card title="Search links for this itinerary" subtitle="Opening a link doesn't confirm availability.">
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {links.map((l) => (
              <li key={l.id}><ExternalLink href={l.url}>{l.label}</ExternalLink>{!l.prefilled && <span className="ml-1 text-[10px] text-slate-500">(enter details on site)</span>}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={saveIt} disabled={!urlOk}><Save className="h-4 w-4" /> Save comparison</Button>
        {c.id && (
          <Button onClick={() => { setC({ ...c, id: '', title: `${c.title} (copy)` }); }}><Copy className="h-4 w-4" /> Duplicate</Button>
        )}
        {c.id && (
          <Button variant="danger" onClick={async () => { if (confirm('Delete this comparison?')) { await db.comparisons.delete(c.id); onDeleted(); } }}><Trash2 className="h-4 w-4" /> Delete</Button>
        )}
      </div>
    </div>
  );
}
