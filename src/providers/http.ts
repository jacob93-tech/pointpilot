/**
 * Small fetch wrapper: timeouts, typed errors, offline detection, and per-host
 * rate limiting so free services' usage policies are respected.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public kind: 'offline' | 'timeout' | 'http' | 'rate-limited' | 'parse' | 'network',
    public status?: number,
  ) {
    super(message);
  }
}

const lastCall = new Map<string, number>();
const queues = new Map<string, Promise<void>>();

/** Serialize calls per key with a minimum interval (e.g. Nominatim: 1 request/second). */
export function rateLimit(key: string, minIntervalMs: number): Promise<void> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.then(async () => {
    const wait = (lastCall.get(key) ?? 0) + minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall.set(key, Date.now());
  });
  queues.set(key, next.catch(() => undefined));
  return next;
}

export async function fetchJSON<T>(url: string, opts: { timeoutMs?: number; signal?: AbortSignal; headers?: Record<string, string> } = {}): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ProviderError('You appear to be offline.', 'offline');
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12000);
  opts.signal?.addEventListener('abort', () => ctrl.abort());
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json', ...(opts.headers ?? {}) }, referrerPolicy: 'strict-origin-when-cross-origin' });
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error).name === 'AbortError') throw new ProviderError('The service took too long to respond.', 'timeout');
    throw new ProviderError('Network error reaching the service.', 'network');
  }
  clearTimeout(timer);
  if (res.status === 429) throw new ProviderError('The free service is rate-limiting requests. Try again in a minute.', 'rate-limited', 429);
  if (!res.ok) throw new ProviderError(`Service responded with HTTP ${res.status}.`, 'http', res.status);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ProviderError('Unexpected response from the service.', 'parse');
  }
}

export function describeError(e: unknown): string {
  if (e instanceof ProviderError) return e.message;
  return (e as Error)?.message ?? 'Unknown error';
}
