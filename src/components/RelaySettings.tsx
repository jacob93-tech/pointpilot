import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plane } from 'lucide-react';
import { DEFAULT_CAP, getRelayConfig, getUsage, normalizeRelayUrl, relayQuota, saveRelayConfig, type RelayQuota } from '../providers/realFlights';
import { describeError } from '../providers/http';
import { Button, Card, ExternalLink, Field, Input, Notice, NumberInput, useToast } from './ui';

const REPO = 'https://github.com/jacob93-tech/pointpilot/blob/main/README.md#real-flight-search-optional-free';

export function RelaySettings() {
  const toast = useToast();
  const cfg = useLiveQuery(() => getRelayConfig(), []);
  const usage = useLiveQuery(() => getUsage(), []);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [cap, setCap] = useState<number | null>(DEFAULT_CAP);
  const [quota, setQuota] = useState<RelayQuota | null>(null);
  const [testing, setTesting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (cfg === undefined || loaded) return;
    setLoaded(true);
    if (cfg) {
      setUrl(cfg.url);
      setToken(cfg.token);
      setCap(cfg.monthlyCap);
    }
  }, [cfg, loaded]);

  useEffect(() => {
    if (location.hash.includes('real-flights')) document.getElementById('real-flights')?.scrollIntoView({ block: 'start' });
  }, []);

  const save = async () => {
    setErr(null);
    try {
      const c = { url: normalizeRelayUrl(url), token: token.trim(), monthlyCap: Math.max(1, Math.min(10000, cap ?? DEFAULT_CAP)) };
      if (c.token.length < 12) throw new Error('Use an app token of at least 12 characters (the same one you set as APP_TOKEN on the Worker).');
      await saveRelayConfig(c);
      setTesting(true);
      try {
        setQuota(await relayQuota(c));
        toast('Connected — real flight search is on', 'success');
      } catch (e) {
        setErr(`Saved, but the test failed: ${describeError(e)}`);
      }
    } catch (e) {
      setErr(describeError(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div id="real-flights" className="scroll-mt-4">
      <Card title={<span className="inline-flex items-center gap-2"><Plane className="h-4 w-4" /> Real flight search (optional, free)</span>}>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          Shows actual Google Flights results — airlines, flight numbers, times and cash prices — on each destination’s “How to book” tab. It runs through <b>your own</b> free{' '}
          <ExternalLink href="https://serpapi.com/pricing">SerpApi</ExternalLink> account (free plan, monthly search allowance, no card) and a tiny free{' '}
          <ExternalLink href="https://workers.cloudflare.com/">Cloudflare Worker</ExternalLink> that keeps your SerpApi key private. Award-seat availability is not included — no free source exists.
        </p>
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-slate-600 dark:text-slate-400">
          <li>Create free SerpApi and Cloudflare accounts (don’t add a payment method to either).</li>
          <li>Create a Worker from <code>worker/serpapi-relay.js</code> and add the secrets <code>SERPAPI_KEY</code> and <code>APP_TOKEN</code> plus the variable <code>ALLOWED_ORIGINS</code>.</li>
          <li>Paste the Worker’s URL and the same app token below. <ExternalLink href={REPO}>Full steps</ExternalLink></li>
        </ol>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1.5fr_1fr]">
          <Field label="Worker URL" htmlFor="rf-url">
            <Input id="rf-url" value={url} placeholder="https://pointpilot-flights.yourname.workers.dev" onChange={(e) => setUrl(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          <Field label="App token (same as the Worker’s APP_TOKEN)" htmlFor="rf-tok" hint="Stored only in this browser; never included in exports.">
            <Input id="rf-tok" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          <Field label="Max searches / month (this browser)" htmlFor="rf-cap" hint="Keep under your SerpApi free allowance.">
            <NumberInput id="rf-cap" value={cap} min={1} max={10000} onChange={setCap} />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={save} loading={testing} disabled={!url || !token}>
            Save & test connection
          </Button>
          {cfg && (
            <Button
              variant="ghost"
              onClick={async () => {
                await saveRelayConfig(null);
                setUrl('');
                setToken('');
                setQuota(null);
                toast('Real flight search turned off', 'info');
              }}
            >
              Turn off
            </Button>
          )}
          <span className="text-xs text-slate-500">
            {cfg ? `On · ${usage?.count ?? 0} of ${cfg.monthlyCap} searches used this month in this browser` : 'Off'}
          </span>
        </div>
        {quota && (
          <Notice tone="success" className="mt-3">
            Connected to SerpApi{quota.plan ? ` (${quota.plan})` : ''}: {quota.searchesLeft ?? '?'} searches left this month
            {quota.searchesPerMonth ? ` of ${quota.searchesPerMonth}` : ''}. This check doesn’t use a search.
          </Notice>
        )}
        {err && (
          <Notice tone="warn" className="mt-3">
            {err}
          </Notice>
        )}
      </Card>
    </div>
  );
}
