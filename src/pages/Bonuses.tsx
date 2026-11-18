import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { db, nowISO, uid } from '../lib/db';
import { useProfile, useToday } from '../lib/hooks';
import type { TransferBonus, TransferPartner } from '../lib/types';
import { bestBonusFor, bonusState, effectiveRatio, formatRatio, partnerReceived, planTransfer, ratioFor } from '../engine/transfer';
import { centsPerPoint, judge } from '../engine/redemption';
import { getCard } from '../data/cards';
import { PARTNER_SOURCES } from '../data/partners';
import { Badge, BonusBadge, Button, Card, ExternalLink, Field, Input, Modal, Notice, NumberInput, PageHeader, Select, Stat, TextArea, Toggle, useToast } from '../components/ui';
import { cpp, fmtDate, pts, relTime } from '../lib/format';
import { sanitizeUrl } from '../lib/gmaps';

export function Bonuses() {
  const profile = useProfile();
  const today = useToday();
  const toast = useToast();
  const partners = useLiveQuery(() => db.partners.toArray(), []) ?? [];
  const bonuses = useLiveQuery(() => db.bonuses.toArray(), []) ?? [];
  const [showExpired, setShowExpired] = useState(false);
  const [edit, setEdit] = useState<TransferBonus | null>(null);
  const [editPartner, setEditPartner] = useState<TransferPartner | null>(null);
  const card = getCard(profile.cardId);
  const pName = (id: string) => partners.find((p) => p.id === id)?.name ?? id;

  const rows = useMemo(
    () =>
      bonuses
        .map((b) => ({ b, s: bonusState(b, today, profile.bonusVerifyWindowDays), p: partners.find((p) => p.id === b.partnerId) }))
        .filter((r) => showExpired || r.s !== 'expired')
        .sort((a, b) => order(a.s) - order(b.s) || (a.b.endDate ?? '9').localeCompare(b.b.endDate ?? '9')),
    [bonuses, partners, today, showExpired, profile.bonusVerifyWindowDays],
  );
  const expiredCount = bonuses.filter((b) => bonusState(b, today) === 'expired').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transfer bonuses & partners"
        subtitle="Chase doesn't publish bonuses in a public feed and its transfer screen requires login, so this tracker is manual-first: bonuses reported by third parties stay “Needs verification” until you confirm them in your own Chase account. Status is computed from dates, so expired promotions can never show as active."
      />
      <Notice tone="warn" title="Transfers are irreversible">
        Never transfer points until you've found bookable award space on the partner's site and compared it with the cash price. A bonus doesn't make a transfer a good deal on its own. PointPilot never transfers points for you.
      </Notice>

      <BonusCalculator partners={partners} bonuses={bonuses} />

      <Card
        title="Transfer bonus tracker"
        subtitle={`Verification window: ${profile.bonusVerifyWindowDays} days (change in Settings). Seeded reports from ${fmtDate('2026-11-18')}.`}
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              setEdit({ id: '', partnerId: partners[0]?.id ?? '', bonusPercent: 25, eligibility: '', targeted: false, sourceName: '', sourceUrl: '', reportedAt: today, createdBy: 'user' })
            }
          >
            <Plus className="h-4 w-4" /> Add bonus
          </Button>
        }
      >
        <div className="mb-2 flex justify-end">
          <Toggle checked={showExpired} onChange={setShowExpired} label={`Show expired (${expiredCount})`} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="py-2 pr-3">Partner</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 text-right">Bonus</th>
                <th className="py-2 pr-3">Std → effective ratio</th>
                <th className="py-2 pr-3">1,000 Chase →</th>
                <th className="py-2 pr-3">Dates</th>
                <th className="py-2 pr-3">Eligibility</th>
                <th className="py-2 pr-3">Source / verified</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ b, s, p }) => {
                const ratio = p ? ratioFor(p, profile.cardId) : { chase: 1, partner: 1 };
                return (
                  <tr key={b.id} className="border-b border-slate-100 align-top dark:border-slate-800">
                    <td className="py-2 pr-3 font-medium">{pName(b.partnerId)}</td>
                    <td className="py-2 pr-3"><BonusBadge state={s} targeted={b.targeted} /></td>
                    <td className="tabular py-2 pr-3 text-right font-semibold">{b.bonusPercent}%</td>
                    <td className="tabular py-2 pr-3">
                      {formatRatio(ratio)} → 1:{effectiveRatio(ratio, b.bonusPercent).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}
                    </td>
                    <td className="tabular py-2 pr-3">{pts(partnerReceived(1000, ratio, b.bonusPercent))} pts</td>
                    <td className="py-2 pr-3 text-xs">
                      {b.startDate ? fmtDate(b.startDate) : 'start n/a'} – {b.endDate ? fmtDate(b.endDate) : <span className="text-amber-600">no end date</span>}
                    </td>
                    <td className="max-w-[220px] py-2 pr-3 text-xs text-slate-600 dark:text-slate-400">{b.eligibility || '—'}{b.notes && <div className="mt-1 text-amber-700 dark:text-amber-400">{b.notes}</div>}</td>
                    <td className="py-2 pr-3 text-xs">
                      {sanitizeUrl(b.sourceUrl) ? <ExternalLink href={b.sourceUrl}>{b.sourceName || 'Source'}</ExternalLink> : b.sourceName || '—'}
                      <div className="text-slate-500">Reported {fmtDate(b.reportedAt)}</div>
                      <div className="text-slate-500">Verified by you: {b.verifiedAt ? relTime(b.verifiedAt) : 'never'}</div>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        {s !== 'expired' && (
                          <Button size="sm" title="I saw this bonus on my Chase transfer screen today" onClick={async () => { await db.bonuses.update(b.id, { verifiedAt: nowISO() }); toast('Marked verified today', 'success'); }}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Verify
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEdit(b)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" aria-label="Delete" onClick={async () => { if (confirm('Delete this bonus record?')) await db.bonuses.delete(b.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-500">No current bonuses recorded. Add one when you see it on Chase’s transfer screen.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          “Verify” means you saw the offer on your Chase “Transfer to travel partners” screen. Only verified bonuses are applied automatically in calculations; unverified ones are shown as a separate “if real” scenario.
        </p>
      </Card>

      <Card
        title="Chase transfer partners"
        subtitle={<>Ratios shown for your card: <b>{card.name}</b>. Seed compiled 2026-11-18 from public sources — confirm in your Chase account.</>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="py-2 pr-3">Partner</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Your ratio</th>
                <th className="py-2 pr-3">Min / increment</th>
                <th className="py-2 pr-3">Transfer time</th>
                <th className="py-2 pr-3">Notes</th>
                <th className="py-2 pr-3">Verified by you</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {[...partners].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)).map((p) => {
                const r = ratioFor(p, profile.cardId);
                const best = bestBonusFor(p.id, bonuses, { today, verifyWindowDays: profile.bonusVerifyWindowDays });
                return (
                  <tr key={p.id} className={`border-b border-slate-100 align-top dark:border-slate-800 ${p.active ? '' : 'opacity-50'}`}>
                    <td className="py-2 pr-3">
                      <ExternalLink href={p.bookingUrl} className="font-medium">{p.name}</ExternalLink>
                      <div className="text-xs text-slate-500">{p.program}{p.alliance ? ` · ${p.alliance}` : ''}</div>
                      {p.seedConfidence === 'reported-new' && <Badge tone="amber">Newly reported — single source</Badge>}
                      {!p.active && <Badge tone="red">Marked inactive</Badge>}
                    </td>
                    <td className="py-2 pr-3 capitalize">{p.type}</td>
                    <td className="tabular py-2 pr-3 font-semibold">
                      {formatRatio(r)}
                      {r !== p.ratio && <div className="text-[11px] font-normal text-slate-500">card-specific</div>}
                      {best && <div><Badge tone="green">+{best.bonus.bonusPercent}% verified</Badge></div>}
                    </td>
                    <td className="tabular py-2 pr-3 text-xs">{pts(p.minTransfer)} / {pts(p.increment)}</td>
                    <td className="py-2 pr-3 text-xs">{p.transferTime}</td>
                    <td className="max-w-[300px] py-2 pr-3 text-xs text-slate-600 dark:text-slate-400">{p.notes}</td>
                    <td className="py-2 pr-3 text-xs">{p.userVerifiedAt ? relTime(p.userVerifiedAt) : 'never'}</td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        <Button size="sm" onClick={async () => { await db.partners.update(p.id, { userVerifiedAt: nowISO() }); toast(`${p.name} ratio marked verified`, 'success'); }}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Verify
                        </Button>
                        <Button size="sm" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => setEditPartner(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Sources: {PARTNER_SOURCES.map((u, i) => <span key={u}>{i > 0 && ' · '}<ExternalLink href={u}>{new URL(u).hostname}</ExternalLink></span>)}. Sources conflict on some details (e.g. which cards get Hyatt 4:3) — your Chase account is authoritative.
        </p>
      </Card>

      <BonusEditor bonus={edit} partners={partners} onClose={() => setEdit(null)} />
      <PartnerEditor partner={editPartner} onClose={() => setEditPartner(null)} />
    </div>
  );
}

function order(s: string) {
  return s === 'verified-active' ? 0 : s === 'needs-verification' ? 1 : s === 'upcoming' ? 2 : 3;
}

function BonusCalculator({ partners, bonuses }: { partners: TransferPartner[]; bonuses: TransferBonus[] }) {
  const profile = useProfile();
  const today = useToday();
  const [partnerId, setPartnerId] = useState('british-airways');
  const [needed, setNeeded] = useState<number | null>(26000);
  const [bonusPct, setBonusPct] = useState<number | null>(null);
  const [cash, setCash] = useState<number | null>(null);
  const [fees, setFees] = useState<number | null>(11.2);
  const p = partners.find((x) => x.id === partnerId);
  if (!p) return null;
  const ratio = ratioFor(p, profile.cardId);
  const verified = bestBonusFor(p.id, bonuses, { today, verifyWindowDays: profile.bonusVerifyWindowDays });
  const reported = bestBonusFor(p.id, bonuses, { today, verifyWindowDays: profile.bonusVerifyWindowDays, includeUnverified: true });
  const effBonus = bonusPct ?? verified?.bonus.bonusPercent ?? 0;
  const plan = needed ? planTransfer(needed, ratio, effBonus, p.increment, p.minTransfer) : null;
  const card = getCard(profile.cardId);
  const cppWith = plan && cash != null ? centsPerPoint(cash, fees ?? 0, plan.chasePoints) : null;
  const cppWithout = plan && cash != null ? centsPerPoint(cash, fees ?? 0, plan.chasePointsWithoutBonus) : null;
  const verdict = judge(cppWith, card.travelBaseCpp, profile.minAcceptableCpp);
  const ctPoints = cash != null ? Math.ceil((cash * 100) / card.travelBaseCpp) : null;

  return (
    <Card title="Transfer bonus calculator" subtitle="Handles non-1:1 ratios, bonus percentages, flooring of partner points and Chase’s 1,000-point increments.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Field label="Partner" htmlFor="bc-p">
          <Select id="bc-p" value={partnerId} onChange={(e) => { setPartnerId(e.target.value); setBonusPct(null); }}>
            {partners.map((x) => <option key={x.id} value={x.id}>{x.name} — {x.program}</option>)}
          </Select>
        </Field>
        <Field label="Partner points the award needs" htmlFor="bc-n">
          <NumberInput id="bc-n" value={needed} min={0} max={10_000_000} step={1} allowEmpty onChange={setNeeded} />
        </Field>
        <Field label="Bonus %" htmlFor="bc-b" hint={verified ? `Verified active: ${verified.bonus.bonusPercent}%` : reported ? `Reported (unverified): ${reported.bonus.bonusPercent}% — not applied unless you type it` : 'No active bonus recorded'}>
          <NumberInput id="bc-b" value={bonusPct ?? verified?.bonus.bonusPercent ?? 0} min={0} max={300} onChange={(v) => setBonusPct(v ?? 0)} />
        </Field>
        <Field label="Cash price of the same itinerary (optional)" htmlFor="bc-c" hint="Taxes included, all travelers">
          <NumberInput id="bc-c" value={cash} min={0} max={1_000_000} allowEmpty placeholder="e.g. 600" onChange={setCash} />
        </Field>
        <Field label="Award taxes & fees" htmlFor="bc-f">
          <NumberInput id="bc-f" value={fees} min={0} max={100_000} allowEmpty onChange={setFees} />
        </Field>
      </div>
      {!card.transferEligible && <Notice tone="warn" className="mt-3">{card.name} can't transfer to partners on its own. Results assume points are combined into a transfer-eligible card.</Notice>}
      {plan && (
        <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-5 dark:bg-slate-800/50">
          <Stat label="Chase points to transfer" value={pts(plan.chasePoints)} sub={`Ratio ${formatRatio(ratio)}${effBonus ? ` + ${effBonus}%` : ''}`} />
          <Stat label="Partner points received" value={pts(plan.partnerPoints)} sub={plan.leftover ? `${pts(plan.leftover)} left over` : 'Exact'} />
          <Stat label="Without the bonus" value={pts(plan.chasePointsWithoutBonus)} sub={plan.savedByBonus ? `Bonus saves ${pts(plan.savedByBonus)} pts` : 'No savings'} />
          <Stat label="Balance after" value={pts(profile.points - plan.chasePoints)} sub={profile.points < plan.chasePoints ? <span className="text-rose-600">Insufficient points</span> : `of ${pts(profile.points)}`} />
          <Stat label="Value per Chase point" value={cpp(cppWith)} sub={cppWithout != null ? `${cpp(cppWithout)} without bonus` : 'Add a cash price'} />
        </div>
      )}
      {plan && cash != null && (
        <Notice tone={verdict.verdict === 'good' || verdict.verdict === 'excellent' ? 'success' : verdict.verdict === 'unknown' ? 'info' : 'warn'} className="mt-3" title={verdict.headline}>
          {verdict.detail} For comparison, Chase Travel at {card.travelBaseCpp.toFixed(2)}¢ would need about {pts(ctPoints)} points for the same ${cash.toFixed(0)}
          {profile.pointsBoostCpp > card.travelBaseCpp && card.pointsBoostMaxCpp ? ` (or ~${pts(Math.ceil((cash * 100) / profile.pointsBoostCpp))} if Points Boost at ${profile.pointsBoostCpp}¢ shows for that booking)` : ''}. Worth transferring only if award space is actually bookable.
        </Notice>
      )}
    </Card>
  );
}

function BonusEditor({ bonus, partners, onClose }: { bonus: TransferBonus | null; partners: TransferPartner[]; onClose: () => void }) {
  const [b, setB] = useState<TransferBonus | null>(bonus);
  const [prev, setPrev] = useState(bonus);
  if (bonus !== prev) { setPrev(bonus); setB(bonus); }
  const toast = useToast();
  if (!b) return null;
  const urlOk = !b.sourceUrl || !!sanitizeUrl(b.sourceUrl);
  const datesOk = !b.startDate || !b.endDate || b.startDate <= b.endDate;
  return (
    <Modal open={!!bonus} onClose={onClose} title={b.id ? 'Edit transfer bonus' : 'Add transfer bonus'}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!urlOk || !datesOk || !(b.bonusPercent > 0)) return;
          await db.bonuses.put({ ...b, id: b.id || uid(), sourceUrl: sanitizeUrl(b.sourceUrl) ?? '' });
          toast('Bonus saved', 'success');
          onClose();
        }}
      >
        <Field label="Partner" htmlFor="be-p">
          <Select id="be-p" value={b.partnerId} onChange={(e) => setB({ ...b, partnerId: e.target.value })}>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Bonus %" htmlFor="be-b"><NumberInput id="be-b" value={b.bonusPercent} min={0} max={300} onChange={(v) => setB({ ...b, bonusPercent: v ?? 0 })} /></Field>
          <Field label="Start" htmlFor="be-s"><Input id="be-s" type="date" value={b.startDate ?? ''} onChange={(e) => setB({ ...b, startDate: e.target.value || undefined })} /></Field>
          <Field label="End" htmlFor="be-e"><Input id="be-e" type="date" value={b.endDate ?? ''} onChange={(e) => setB({ ...b, endDate: e.target.value || undefined })} /></Field>
        </div>
        {!datesOk && <p className="text-sm text-rose-600">End date is before the start date.</p>}
        <Field label="Eligibility requirements" htmlFor="be-el"><TextArea id="be-el" value={b.eligibility} maxLength={500} onChange={(e) => setB({ ...b, eligibility: e.target.value })} /></Field>
        <Toggle checked={b.targeted} onChange={(v) => setB({ ...b, targeted: v })} label="Targeted / eligibility-dependent offer" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Source name" htmlFor="be-sn"><Input id="be-sn" value={b.sourceName} maxLength={120} onChange={(e) => setB({ ...b, sourceName: e.target.value })} /></Field>
          <Field label="Source URL" htmlFor="be-su"><Input id="be-su" value={b.sourceUrl} placeholder="https://…" onChange={(e) => setB({ ...b, sourceUrl: e.target.value })} /></Field>
        </div>
        {!urlOk && <p className="text-sm text-rose-600">Source URL must start with http:// or https://</p>}
        <Field label="Notes" htmlFor="be-n"><Input id="be-n" value={b.notes ?? ''} maxLength={300} onChange={(e) => setB({ ...b, notes: e.target.value })} /></Field>
        <Toggle
          checked={!!b.verifiedAt}
          onChange={(v) => setB({ ...b, verifiedAt: v ? nowISO() : undefined })}
          label="I confirmed this on my Chase transfer screen today"
        />
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={!urlOk || !datesOk || !(b.bonusPercent > 0)}>Save</Button>
          <Button type="button" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}

function PartnerEditor({ partner, onClose }: { partner: TransferPartner | null; onClose: () => void }) {
  const [p, setP] = useState<TransferPartner | null>(partner);
  const [prev, setPrev] = useState(partner);
  if (partner !== prev) { setPrev(partner); setP(partner); }
  if (!p) return null;
  const valid = p.ratio.chase > 0 && p.ratio.partner > 0 && p.increment > 0 && p.minTransfer > 0;
  return (
    <Modal open={!!partner} onClose={onClose} title={`Edit ${p.name}`}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          await db.partners.put(p);
          onClose();
        }}
      >
        <Notice className="text-xs">This edits the default ratio. Card-specific overrides (e.g. Hyatt 4:3 on Sapphire Preferred) are applied on top; update those by switching card in Settings if Chase changes them.</Notice>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Chase points" htmlFor="pe-c"><NumberInput id="pe-c" value={p.ratio.chase} min={1} max={100000} onChange={(v) => setP({ ...p, ratio: { ...p.ratio, chase: v ?? 1 } })} /></Field>
          <Field label="→ Partner points" htmlFor="pe-p"><NumberInput id="pe-p" value={p.ratio.partner} min={1} max={100000} onChange={(v) => setP({ ...p, ratio: { ...p.ratio, partner: v ?? 1 } })} /></Field>
          <Field label="Minimum transfer" htmlFor="pe-m"><NumberInput id="pe-m" value={p.minTransfer} min={1} max={1000000} step={1} onChange={(v) => setP({ ...p, minTransfer: v ?? 1000 })} /></Field>
          <Field label="Increment" htmlFor="pe-i"><NumberInput id="pe-i" value={p.increment} min={1} max={1000000} step={1} onChange={(v) => setP({ ...p, increment: v ?? 1000 })} /></Field>
        </div>
        <Field label="Notes" htmlFor="pe-n"><TextArea id="pe-n" value={p.notes} onChange={(e) => setP({ ...p, notes: e.target.value })} /></Field>
        <Toggle checked={p.active} onChange={(v) => setP({ ...p, active: v })} label="Active partner (uncheck if Chase dropped it)" />
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={!valid}>Save</Button>
          <Button type="button" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
