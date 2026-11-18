import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Luggage, Plus, Trash2 } from 'lucide-react';
import { db, nowISO, uid } from '../lib/db';
import { useOnline, useProfile, useToday } from '../lib/hooks';
import { EXPENSE_CATEGORIES, summarizeBudget } from '../engine/budget';
import { COMMON_CURRENCIES, getRates, toHome, type FxRates } from '../providers/fx';
import type { Expense, ExpenseCategory } from '../lib/types';
import { fmtDate, money, pts, usd } from '../lib/format';
import { Badge, Button, Card, EmptyState, Field, Input, Notice, NumberInput, PageHeader, QualityBadge, Select, Stat, useToast } from '../components/ui';

export function Budget() {
  const [qs, setQs] = useSearchParams();
  const trips = useLiveQuery(() => db.trips.orderBy('startDate').toArray(), []);
  const tripId = qs.get('trip') ?? trips?.[0]?.id;
  const trip = trips?.find((t) => t.id === tripId);
  const expenses = useLiveQuery(() => (tripId ? db.expenses.where('tripId').equals(tripId).toArray() : []), [tripId]) ?? [];
  const profile = useProfile();
  const today = useToday();

  if (!trips) return null;
  if (!trip)
    return (
      <div>
        <PageHeader title="Budget" />
        <EmptyState icon={<Luggage className="h-7 w-7" />} title="No trips yet" action={<Link to="/trips" className="text-brand-700 underline">Go to My Trips</Link>}>Budgets belong to a trip.</EmptyState>
      </div>
    );

  const s = summarizeBudget(trip, expenses, profile.points, today);
  const maxCat = Math.max(1, ...EXPENSE_CATEGORIES.map((c) => Math.max(s.byCategory[c.id].estimated, s.byCategory[c.id].actual)));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Trip budget"
        subtitle="Enter expenses manually — no bank connections. Amounts in other currencies are converted with free ECB reference rates (Frankfurter) and stored with the rate and date used."
        action={
          <Select aria-label="Trip" value={trip.id} onChange={(e) => setQs({ trip: e.target.value })} className="w-64">
            {trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Card><Stat label="Cash budget" value={usd(trip.cashBudget)} sub={<Link className="text-brand-700 dark:text-brand-300" to={`/trips/${trip.id}`}>Edit on trip</Link>} /></Card>
        <Card><Stat label="Actual spent" value={usd(s.actualTotal)} sub={`${usd(s.estimatedTotal)} estimated`} /></Card>
        <Card><Stat label="Remaining budget" value={<span className={s.overBudget ? 'text-rose-600' : ''}>{usd(s.remainingBudget)}</span>} sub={s.overBudget ? 'Over budget' : `${s.daysLeft} of ${s.tripDays} days left`} /></Card>
        <Card><Stat label="Daily allowance" value={s.dailyAllowance != null ? usd(s.dailyAllowance) : '—'} sub={s.daysLeft ? 'Remaining budget ÷ days left' : 'Trip finished'} /></Card>
        <Card><Stat label="Points used (actual)" value={pts(s.pointsUsed)} sub={`of ${pts(trip.pointsBudget)} planned`} /></Card>
        <Card><Stat label="Points remaining" value={pts(s.remainingPoints)} sub="Your Settings balance minus points recorded here" /></Card>
        <Card className="col-span-2"><Stat label="Total trip cost (cash, actual)" value={usd(s.actualTotal)} sub={`Estimated plan: ${usd(s.estimatedTotal)} · difference ${usd(s.actualTotal - s.estimatedTotal)}`} /></Card>
      </div>

      <Card title="By category" subtitle="Estimated vs actual">
        <div className="space-y-3">
          {EXPENSE_CATEGORIES.map((c) => {
            const row = s.byCategory[c.id];
            return (
              <div key={c.id}>
                <div className="flex justify-between text-sm">
                  <span>{c.label}</span>
                  <span className="tabular text-xs text-slate-500">
                    est. {usd(row.estimated)} · actual <b className="text-slate-900 dark:text-slate-100">{usd(row.actual)}</b>{row.points ? ` · ${pts(row.points)} pts` : ''}
                  </span>
                </div>
                <div className="mt-1 space-y-0.5">
                  <div className="h-1.5 rounded-full bg-amber-300/70" style={{ width: `${(row.estimated / maxCat) * 100}%` }} aria-hidden />
                  <div className={`h-1.5 rounded-full ${row.actual > row.estimated && row.estimated > 0 ? 'bg-rose-500' : 'bg-brand-600'}`} style={{ width: `${(row.actual / maxCat) * 100}%` }} aria-hidden />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-3 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-amber-300" /> Estimated</span><span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-brand-600" /> Actual</span></div>
      </Card>

      <ExpenseForm tripId={trip.id} defaultDate={trip.startDate > today ? trip.startDate : today} />

      <Card title={`Expenses (${expenses.length})`}>
        {expenses.length === 0 ? <p className="text-sm text-slate-500">No expenses yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr className="border-b border-slate-200 dark:border-slate-800"><th className="py-2">Date</th><th>Description</th><th>Category</th><th>Type</th><th className="text-right">Amount</th><th className="text-right">USD</th><th className="text-right">Points</th><th /></tr>
              </thead>
              <tbody>
                {[...expenses].sort((a, b) => a.date.localeCompare(b.date)).map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 text-xs">{fmtDate(e.date)}</td>
                    <td>{e.description || '—'}</td>
                    <td className="text-xs">{EXPENSE_CATEGORIES.find((c) => c.id === e.category)?.label}</td>
                    <td>{e.kind === 'estimated' ? <QualityBadge q="estimate" /> : <Badge tone="green">Actual</Badge>}</td>
                    <td className="tabular text-right">{money(e.amount, e.currency, 2)}</td>
                    <td className="tabular text-right">{usd(e.amountHome, 2)}{e.fxRate && <div className="text-[10px] text-slate-500">@ {e.fxRate.toFixed(4)} ({e.fxDate})</div>}</td>
                    <td className="tabular text-right">{e.pointsUsed ? pts(e.pointsUsed) : ''}</td>
                    <td className="text-right">
                      {e.kind === 'estimated' && <Button size="sm" variant="ghost" title="Mark as actual" onClick={() => db.expenses.update(e.id, { kind: 'actual' })}>✓</Button>}
                      <Button size="sm" variant="ghost" aria-label="Delete expense" onClick={() => db.expenses.delete(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ExpenseForm({ tripId, defaultDate }: { tripId: string; defaultDate: string }) {
  const online = useOnline();
  const toast = useToast();
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'actual' | 'estimated'>('actual');
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [points, setPoints] = useState<number | null>(0);
  const [date, setDate] = useState(defaultDate);
  const [rates, setRates] = useState<FxRates | null>(null);
  const [fxErr, setFxErr] = useState('');
  const [manualRate, setManualRate] = useState<number | null>(null);

  useEffect(() => {
    if (currency === 'USD' || rates) return;
    getRates('USD').then(setRates).catch((e) => setFxErr((e as Error).message));
  }, [currency, rates, online]);

  const rate = currency === 'USD' ? 1 : manualRate ?? rates?.rates[currency] ?? null;
  const home = amount != null && rate ? (currency === 'USD' ? amount : rates && !manualRate ? toHome(amount, currency, rates) : amount / rate) : null;
  const valid = amount != null && amount >= 0 && home != null && !!date;

  return (
    <Card title="Add expense">
      <form
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          const row: Expense = {
            id: uid(), tripId, category, description: description.trim(), kind, amount: amount!, currency, amountHome: Math.round(home! * 100) / 100,
            fxRate: currency === 'USD' ? undefined : rate!, fxDate: currency === 'USD' ? undefined : manualRate ? 'manual' : rates?.date,
            pointsUsed: points ?? 0, date, createdAt: nowISO(),
          };
          await db.expenses.put(row);
          setAmount(null); setDescription(''); setPoints(0);
          toast('Expense added', 'success');
        }}
      >
        <Field label="Category" htmlFor="ex-c"><Select id="ex-c" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>{EXPENSE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
        <Field label="Description" htmlFor="ex-d"><Input id="ex-d" value={description} maxLength={120} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Type" htmlFor="ex-k"><Select id="ex-k" value={kind} onChange={(e) => setKind(e.target.value as 'actual' | 'estimated')}><option value="actual">Actual (spent)</option><option value="estimated">Estimated (planned)</option></Select></Field>
        <Field label="Date" htmlFor="ex-dt"><Input id="ex-dt" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Amount" htmlFor="ex-a"><NumberInput id="ex-a" value={amount} allowEmpty min={0} max={10_000_000} onChange={setAmount} /></Field>
        <Field label="Currency" htmlFor="ex-cur"><Select id="ex-cur" value={currency} onChange={(e) => { setCurrency(e.target.value); setManualRate(null); }}>{COMMON_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Points used" htmlFor="ex-p" hint="Chase points spent on this item, if any"><NumberInput id="ex-p" value={points} allowEmpty min={0} max={10_000_000} step={1} onChange={setPoints} /></Field>
        <div className="flex items-end"><Button type="submit" variant="primary" disabled={!valid} className="w-full"><Plus className="h-4 w-4" /> Add</Button></div>
        {currency !== 'USD' && (
          <div className="sm:col-span-2 lg:col-span-4">
            {rates?.rates[currency] && !manualRate ? (
              <p className="text-xs text-slate-500">
                1 USD = {rates.rates[currency]} {currency} · ECB reference rate for {rates.date} <QualityBadge q={rates.stale ? 'cached' : 'live'} />{home != null && <> · ≈ <b>{usd(home, 2)}</b></>}
              </p>
            ) : (
              <Notice tone="warn" className="text-xs">
                {fxErr || (rates ? `${currency} isn't in the free ECB rate set.` : 'Loading rates…')} Enter a rate manually (how many {currency} per 1 USD):
                <div className="mt-1 w-32"><NumberInput aria-label="Manual exchange rate" value={manualRate} allowEmpty min={0} max={1e9} onChange={setManualRate} /></div>
              </Notice>
            )}
          </div>
        )}
      </form>
    </Card>
  );
}
