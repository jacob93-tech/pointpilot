import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useProfile, useToday } from '../lib/hooks';
import { getCard } from '../data/cards';
import { bestBonusFor, planTransfer, ratioFor } from '../engine/transfer';
import { centsPerPoint, judge, type VerdictResult } from '../engine/redemption';
import { cpp, pts, usd } from '../lib/format';
import { Badge, Card, Field, Notice, NumberInput, Select, Toggle } from './ui';

interface Row {
  id: string;
  label: string;
  chasePoints: number;
  cash: number;
  cpp: number | null;
  saved: number;
  remaining: number;
  verdict: VerdictResult | null;
  note?: string;
  feasible: boolean;
}

export function RedemptionCalculator() {
  const profile = useProfile();
  const today = useToday();
  const partners = (useLiveQuery(() => db.partners.toArray(), []) ?? []).filter((p) => p.active);
  const bonuses = useLiveQuery(() => db.bonuses.toArray(), []) ?? [];
  const card = getCard(profile.cardId);

  const [perPerson, setPerPerson] = useState(true);
  const [travelers, setTravelers] = useState(profile.travelers);
  const [cash, setCash] = useState<number | null>(450);
  const [ctPoints, setCtPoints] = useState<number | null>(null);
  const [partnerId, setPartnerId] = useState('united');
  const [miles, setMiles] = useState<number | null>(25000);
  const [bonusPct, setBonusPct] = useState<number | null>(null);
  const [fees, setFees] = useState<number | null>(5.6);
  const [extra, setExtra] = useState<number | null>(0);
  const [boost, setBoost] = useState(false);

  const k = perPerson ? Math.max(1, travelers) : 1;
  const partner = partners.find((p) => p.id === partnerId);
  const verified = partner ? bestBonusFor(partner.id, bonuses, { today, verifyWindowDays: profile.bonusVerifyWindowDays }) : null;
  const bonus = bonusPct ?? verified?.bonus.bonusPercent ?? 0;
  const minCpp = profile.minAcceptableCpp;
  const rows: Row[] = [];
  const totalCash = cash != null ? cash * k : null;
  const addl = (extra ?? 0) * k;

  if (totalCash != null) {
    rows.push({ id: 'cash', label: 'Pay cash', chasePoints: 0, cash: totalCash, cpp: null, saved: 0, remaining: profile.points, verdict: null, note: 'Keeps all your points for a better redemption later.', feasible: true });
    const ct = ctPoints != null ? ctPoints * k : Math.ceil((totalCash * 100) / card.travelBaseCpp);
    const ctCpp = centsPerPoint(totalCash, 0, ct);
    rows.push({ id: 'ct', label: `Chase Travel${ctPoints == null ? ` at ${card.travelBaseCpp.toFixed(2)}¢` : ' (your price)'}`, chasePoints: ct, cash: 0, cpp: ctCpp, saved: totalCash, remaining: profile.points - ct, verdict: judge(ctCpp, card.travelBaseCpp, minCpp), feasible: ct <= profile.points });
    if (boost && card.pointsBoostMaxCpp) {
      const b = Math.ceil((totalCash * 100) / profile.pointsBoostCpp);
      const bc = centsPerPoint(totalCash, 0, b);
      rows.push({ id: 'boost', label: `Chase Travel with Points Boost at ${profile.pointsBoostCpp}¢`, chasePoints: b, cash: 0, cpp: bc, saved: totalCash, remaining: profile.points - b, verdict: judge(bc, card.travelBaseCpp, minCpp), note: 'Only if this exact booking shows Points Boost in Chase Travel.', feasible: b <= profile.points });
    }
    if (partner && miles) {
      const plan = planTransfer(miles * k, ratioFor(partner, profile.cardId), bonus, partner.increment, partner.minTransfer);
      const f = (fees ?? 0) * k;
      const tc = centsPerPoint(totalCash, f, plan.chasePoints, addl);
      rows.push({
        id: 'transfer',
        label: `Transfer to ${partner.name}${bonus ? ` (+${bonus}%)` : ''}`,
        chasePoints: plan.chasePoints,
        cash: f + addl,
        cpp: tc,
        saved: totalCash - f - addl,
        remaining: profile.points - plan.chasePoints,
        verdict: judge(tc, card.travelBaseCpp, minCpp),
        note: `${pts(plan.partnerPoints)} ${partner.program} points arrive${plan.leftover ? ` (${pts(plan.leftover)} left over)` : ''}.${plan.savedByBonus ? ` Bonus saves ${pts(plan.savedByBonus)} Chase pts.` : ''}${card.transferEligible ? '' : ' Requires a transfer-eligible card.'}`,
        feasible: plan.chasePoints <= profile.points && card.transferEligible,
      });
    }
  }
  // net value = cash saved − points × your minimum value
  const net = (r: Row) => r.saved - (r.chasePoints * minCpp) / 100;
  const best = rows.filter((r) => r.feasible).sort((a, b) => net(b) - net(a))[0];

  return (
    <div className="space-y-4">
      <Card title="Smart redemption value calculator" subtitle="Compare paying cash, Chase Travel and a partner transfer for the same itinerary. Use a cash price for a genuinely comparable booking — not an inflated or unrelated fare.">
        <div className="mb-3 flex flex-wrap items-center gap-4">
          <Toggle checked={perPerson} onChange={setPerPerson} label="Prices are per person" />
          {perPerson && (
            <label className="flex items-center gap-2 text-sm">Travelers <NumberInput aria-label="Travelers" className="w-16 py-1" value={travelers} min={1} max={9} step={1} onChange={(v) => setTravelers(v ?? 1)} /></label>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Cash price (taxes included)" htmlFor="rc-c"><NumberInput id="rc-c" value={cash} allowEmpty min={0} max={1_000_000} onChange={setCash} /></Field>
          <Field label="Chase Travel points (optional)" htmlFor="rc-ct" hint="Leave blank to compute from the base rate."><NumberInput id="rc-ct" value={ctPoints} allowEmpty min={0} max={10_000_000} step={1} onChange={setCtPoints} /></Field>
          <Field label="Transfer partner" htmlFor="rc-p">
            <Select id="rc-p" value={partnerId} onChange={(e) => { setPartnerId(e.target.value); setBonusPct(null); }}>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.program}</option>)}
            </Select>
          </Field>
          <Field label="Partner miles/points required" htmlFor="rc-m"><NumberInput id="rc-m" value={miles} allowEmpty min={0} max={10_000_000} step={1} onChange={setMiles} /></Field>
          <Field label="Transfer bonus %" htmlFor="rc-b" hint={verified ? `Verified active: ${verified.bonus.bonusPercent}%` : 'No verified bonus — enter one only if you confirmed it.'}><NumberInput id="rc-b" value={bonusPct ?? verified?.bonus.bonusPercent ?? 0} min={0} max={300} onChange={(v) => setBonusPct(v ?? 0)} /></Field>
          <Field label="Award taxes & fees" htmlFor="rc-f"><NumberInput id="rc-f" value={fees} allowEmpty min={0} max={100000} onChange={setFees} /></Field>
          <Field label="Additional cash costs" htmlFor="rc-x" hint="Positioning flights, bag fees, resort fees…"><NumberInput id="rc-x" value={extra} allowEmpty min={0} max={100000} onChange={setExtra} /></Field>
          <div className="flex items-end pb-2">
            <Toggle checked={boost} onChange={setBoost} label={`Model Points Boost (${profile.pointsBoostCpp}¢)`} />
          </div>
        </div>
      </Card>

      {rows.length > 0 ? (
        <Card title="Results" subtitle={`Your balance: ${pts(profile.points)} · minimum acceptable value ${minCpp.toFixed(2)}¢ (also used as each point's opportunity cost) · card floor ${card.travelBaseCpp.toFixed(2)}¢`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2 pr-3">Method</th>
                  <th className="py-2 pr-3 text-right">Chase points</th>
                  <th className="py-2 pr-3 text-right">Cash required</th>
                  <th className="py-2 pr-3 text-right">¢ per point</th>
                  <th className="py-2 pr-3 text-right">Cash saved</th>
                  <th className="py-2 pr-3 text-right">Net of opportunity cost</th>
                  <th className="py-2 pr-3 text-right">Points left</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-b border-slate-100 align-top dark:border-slate-800 ${best?.id === r.id ? 'bg-brand-50 dark:bg-brand-900/30' : ''}`}>
                    <td className="py-2 pr-3">
                      <div className="font-medium">{r.label} {best?.id === r.id && <Badge tone="brand">Best</Badge>} {!r.feasible && <Badge tone="red">Not possible</Badge>}</div>
                      {r.verdict && <div className="text-xs text-slate-500">{r.verdict.headline}</div>}
                      {r.note && <div className="text-[11px] text-slate-500">{r.note}</div>}
                    </td>
                    <td className="tabular py-2 pr-3 text-right">{pts(r.chasePoints)}</td>
                    <td className="tabular py-2 pr-3 text-right">{usd(r.cash, 2)}</td>
                    <td className="tabular py-2 pr-3 text-right">{cpp(r.cpp)}</td>
                    <td className="tabular py-2 pr-3 text-right">{usd(r.saved, 2)}</td>
                    <td className={`tabular py-2 pr-3 text-right ${net(r) < 0 ? 'text-rose-600' : ''}`}>{usd(net(r), 2)}</td>
                    <td className={`tabular py-2 pr-3 text-right ${r.remaining < 0 ? 'text-rose-600' : ''}`}>{pts(r.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {best && (
            <Notice tone={best.id === 'cash' ? 'info' : 'success'} className="mt-3" title={best.id === 'cash' ? 'Paying cash looks better' : `${best.label} looks best`}>
              {best.id === 'cash'
                ? `None of the points options beat your ${minCpp.toFixed(2)}¢ minimum after accounting for what those points could be worth elsewhere. Save the points unless cash is tight.`
                : `${best.verdict?.detail ?? ''} ${best.id === 'transfer' ? 'Confirm award space is bookable before transferring — transfers are irreversible.' : ''}`}
            </Notice>
          )}
        </Card>
      ) : (
        <Notice>Enter a cash price to compare.</Notice>
      )}
    </div>
  );
}
