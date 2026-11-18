import { useEffect, useRef, useState } from 'react';
import { Database, Download, Trash2, Upload } from 'lucide-react';
import { db, downloadJSON, exportAll, importAll, requestPersistentStorage, updateProfile } from '../lib/db';
import { useProfile } from '../lib/hooks';
import { CARDS, CARD_SOURCES, getCard } from '../data/cards';
import { US_AIRPORTS } from '../data/airports';
import type { Cabin, CardId, TripStyle } from '../lib/types';
import { CABINS, STYLES } from '../components/SearchForm';
import { Button, Card, Chip, ExternalLink, Field, Input, Notice, NumberInput, PageHeader, Select, useToast } from '../components/ui';
import { pts } from '../lib/format';

export function Settings() {
  const profile = useProfile();
  const toast = useToast();
  const card = getCard(profile.cardId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean } | null>(null);
  const [addCode, setAddCode] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const est = await navigator.storage?.estimate?.();
        const persisted = await navigator.storage?.persisted?.();
        setStorage({ usage: est?.usage, quota: est?.quota, persisted });
      } catch {
        setStorage({});
      }
    })();
  }, []);

  const set = (patch: Parameters<typeof updateProfile>[0]) => updateProfile(patch);

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="Your points, card and preferences. Everything is stored only in this browser." />

      <Card title="Chase points & card">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Chase Ultimate Rewards balance" htmlFor="st-p" hint="Type it in — PointPilot never connects to your Chase account.">
            <NumberInput id="st-p" value={profile.points} min={0} max={50_000_000} step={1} onChange={(v) => set({ points: v ?? 0 })} />
          </Field>
          <Field label="Card" htmlFor="st-c">
            <Select id="st-c" value={profile.cardId} onChange={(e) => set({ cardId: e.target.value as CardId })}>
              {CARDS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Minimum acceptable value (¢/pt)" htmlFor="st-m" hint="Your own bar for using points; also each point's opportunity cost. Not a universal rule.">
            <NumberInput id="st-m" value={profile.minAcceptableCpp} min={0.5} max={10} onChange={(v) => set({ minAcceptableCpp: v ?? 1.25 })} />
          </Field>
          <Field label="Points Boost rate to model (¢/pt)" htmlFor="st-b" hint={card.pointsBoostMaxCpp ? `Reported up to ${card.pointsBoostMaxCpp}¢ on select bookings for this card.` : 'This card has no Points Boost.'}>
            <NumberInput id="st-b" value={profile.pointsBoostCpp} min={1} max={3} onChange={(v) => set({ pointsBoostCpp: v ?? 1.5 })} />
          </Field>
          {card.legacyCpp && (
            <Field label={`Legacy-rate points (${card.legacyCpp}¢ until 2027-10-26)`} htmlFor="st-l" hint="Points earned before 2025-10-26 if you held the card before 2025-06-23. For your reference.">
              <NumberInput id="st-l" value={profile.legacyPoints} min={0} max={profile.points} step={1} onChange={(v) => set({ legacyPoints: v ?? 0 })} />
            </Field>
          )}
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-400">
          {card.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
        <p className="mt-2 text-[11px] text-slate-500">
          Card rules compiled 2026-11-18 from {CARD_SOURCES.map((u, i) => <span key={u}>{i > 0 && ', '}<ExternalLink href={u}>{new URL(u).hostname}</ExternalLink></span>)}. Confirm rates in Chase Travel for each booking.
        </p>
      </Card>

      <Card title="Departure airports" subtitle="The home airport costs nothing extra; others carry your estimated round-trip ground cost (gas, parking, rideshare) and travel time.">
        <div className="space-y-2">
          {profile.airports.map((a, i) => (
            <div key={a.code} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800">
              <b className="w-12">{a.code}</b>
              <span className="text-xs text-slate-500">{US_AIRPORTS.find((x) => x.code === a.code)?.city}</span>
              <label className="flex items-center gap-1 text-xs">Ground cost $<NumberInput aria-label={`${a.code} ground cost`} className="w-20 py-1 text-xs" value={a.groundCost} min={0} max={5000} onChange={(v) => set({ airports: profile.airports.map((x, j) => (j === i ? { ...x, groundCost: v ?? 0 } : x)) })} /></label>
              <label className="flex items-center gap-1 text-xs">Hours to get there <NumberInput aria-label={`${a.code} hours`} className="w-16 py-1 text-xs" value={a.groundHours} min={0} max={24} onChange={(v) => set({ airports: profile.airports.map((x, j) => (j === i ? { ...x, groundHours: v ?? 0 } : x)) })} /></label>
              <label className="flex items-center gap-1 text-xs"><input type="radio" name="home" checked={a.isHome} onChange={() => set({ airports: profile.airports.map((x, j) => ({ ...x, isHome: j === i })) })} /> Home</label>
              <Button size="sm" variant="ghost" className="ml-auto" disabled={profile.airports.length <= 1} onClick={() => {
                const next = profile.airports.filter((_, j) => j !== i);
                if (a.isHome && next[0]) next[0] = { ...next[0], isHome: true };
                set({ airports: next });
              }}>Remove</Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Select aria-label="Add airport" value={addCode} onChange={(e) => setAddCode(e.target.value)} className="w-60">
              <option value="">Add airport…</option>
              {US_AIRPORTS.filter((x) => !profile.airports.some((a) => a.code === x.code)).map((x) => <option key={x.code} value={x.code}>{x.code} — {x.city}</option>)}
            </Select>
            <Button disabled={!addCode} onClick={() => { set({ airports: [...profile.airports, { code: addCode, groundCost: 80, groundHours: 2, isHome: false }] }); setAddCode(''); }}>Add</Button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">These are defaults for new searches; Explore keeps its own copy of your last search.</p>
      </Card>

      <Card title="Travel preferences">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Default travelers" htmlFor="st-t"><NumberInput id="st-t" value={profile.travelers} min={1} max={9} step={1} onChange={(v) => set({ travelers: v ?? 1 })} /></Field>
          <Field label="Default cabin" htmlFor="st-cab"><Select id="st-cab" value={profile.cabin} onChange={(e) => set({ cabin: e.target.value as Cabin })}>{CABINS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
          <Field label="Bonus verification window (days)" htmlFor="st-w" hint="A bonus you verified stays “Verified active” this long before needing a recheck.">
            <NumberInput id="st-w" value={profile.bonusVerifyWindowDays} min={1} max={60} step={1} onChange={(v) => set({ bonusVerifyWindowDays: v ?? 7 })} />
          </Field>
        </div>
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">Favorite trip styles</div>
          <div className="flex flex-wrap gap-1.5">
            {STYLES.map((s) => (
              <Chip key={s.id} active={profile.styles.includes(s.id)} onClick={() => set({ styles: (profile.styles.includes(s.id) ? profile.styles.filter((x) => x !== s.id) : [...profile.styles, s.id]) as TripStyle[] })}>{s.label}</Chip>
            ))}
          </div>
        </div>
        <Field label="Email for OpenStreetMap Nominatim (optional)" htmlFor="st-e" className="mt-3 sm:w-1/2" hint="Nominatim's policy asks heavy users to identify themselves. If filled, it is sent only with place searches to nominatim.openstreetmap.org.">
          <Input id="st-e" type="email" value={profile.nominatimEmail} onChange={(e) => set({ nominatimEmail: e.target.value.trim() })} />
        </Field>
      </Card>

      <Card title={<span className="inline-flex items-center gap-2"><Database className="h-4 w-4" /> Your data</span>}>
        <Notice tone="warn" title="Browser-only storage">
          Trips, places, comparisons and settings live in this browser's IndexedDB. Clearing site data, using private browsing, or switching device/browser will lose them unless you export. Export regularly and import on another device.
        </Notice>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={async () => { downloadJSON(await exportAll(), `pointpilot-backup-${new Date().toISOString().slice(0, 10)}.json`); toast('Backup downloaded', 'success'); }}><Download className="h-4 w-4" /> Export everything (JSON)</Button>
          <Button onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Import JSON</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (f.size > 20 * 1024 * 1024) { toast('File too large (max 20 MB)', 'error'); return; }
            try {
              const rep = await importAll(JSON.parse(await f.text()));
              toast(`Imported ${Object.values(rep.imported).reduce((a, b) => a + b, 0)} records${rep.skipped.length ? ` (${rep.skipped.join('; ')})` : ''}`, 'success');
            } catch (err) { toast((err as Error).message || 'Import failed', 'error'); }
          }} />
          <Button onClick={async () => { const ok = await requestPersistentStorage(); toast(ok ? 'Browser granted persistent storage' : 'Browser declined persistent storage (export regularly)', ok ? 'success' : 'info'); setStorage((s) => ({ ...s, persisted: !!ok })); }}>Request persistent storage</Button>
          <Button variant="danger" onClick={async () => {
            if (!confirm('Erase ALL PointPilot data in this browser (trips, places, comparisons, settings)? This cannot be undone. Export first if unsure.')) return;
            await db.delete();
            location.reload();
          }}><Trash2 className="h-4 w-4" /> Erase all data</Button>
        </div>
        {storage && (
          <p className="mt-2 text-xs text-slate-500">
            {storage.usage != null && <>Using {(storage.usage / 1024 / 1024).toFixed(1)} MB{storage.quota ? ` of ~${(storage.quota / 1024 / 1024 / 1024).toFixed(1)} GB available` : ''}. </>}
            Persistent storage: {storage.persisted ? 'granted' : 'not granted (browser may evict data under storage pressure)'}.
          </p>
        )}
        <p className="mt-1 text-xs text-slate-500">Balance on file: {pts(profile.points)} points.</p>
      </Card>

      <Card title="Data sources & limits">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-300">
          <li><b>Transfer partners & bonuses:</b> seeded 2026-11-18 from public reporting; verified only by you. Chase has no public feed, so there is no automatic bonus updating.</li>
          <li><b>Flight & hotel prices:</b> no free, permitted live source exists. Explore uses labeled heuristic estimates; real prices come from what you record.</li>
          <li><b>Weather:</b> observed history from <ExternalLink href="https://open-meteo.com/">Open-Meteo</ExternalLink> (free, non-commercial), cached 90 days.</li>
          <li><b>Maps & places:</b> <ExternalLink href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</ExternalLink>; search via Nominatim (≤1 req/s) with Photon fallback.</li>
          <li><b>Routing:</b> FOSSGIS OSRM (routing.openstreetmap.de) and the OSRM demo server — donation-run, fair use. No free transit routing.</li>
          <li><b>Exchange rates:</b> <ExternalLink href="https://frankfurter.dev/">Frankfurter</ExternalLink> (ECB reference rates, daily).</li>
          <li><b>Photos:</b> Wikipedia/Wikimedia Commons via the REST summary API; licensed per file.</li>
        </ul>
      </Card>
    </div>
  );
}
