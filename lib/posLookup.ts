/**
 * Counter scan resilience. Every QR used to wait on a Netlify server action with no timeout.
 * One hung lookup (cold start, 502, expired session HTML) froze the scan queue, so the next
 * stickers looked like "the server is down and nothing scans" until a refresh. Helpers here:
 *   - time-bound retries
 *   - drain the queue even when one lookup throws
 *   - remember successful GRP- resolutions for the rest of the tab
 */
import { parseGroupScan } from "./groupQr";
import { skuCandidatesFromScan } from "./scan";

export const LOOKUP_TIMEOUT_MS = 4000;
export const LOOKUP_TRIES = 2;
export const SCAN_DEBOUNCE_MS = 140;

export function isTransientPosError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /unavailable|timed out|timeout|fetch|network|503|502|504|500|Failed to fetch|Unexpected token|JSON|abort/i.test(msg);
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label = "lookup"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function retryLookup<T>(
  fn: () => Promise<T>,
  opts: { tries?: number; timeoutMs?: number; label?: string } = {},
): Promise<T> {
  const tries = opts.tries ?? LOOKUP_TRIES;
  const timeoutMs = opts.timeoutMs ?? LOOKUP_TIMEOUT_MS;
  const label = opts.label ?? "lookup";
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await withTimeout(fn(), timeoutMs, label);
    } catch (err) {
      last = err;
      if (!isTransientPosError(err) || i === tries - 1) break;
      await new Promise((r) => setTimeout(r, 280 * (i + 1)));
    }
  }
  throw last;
}

export async function drainScanQueue(
  queue: { current: string[] },
  busy: { current: boolean },
  handle: (payload: string) => Promise<void>,
): Promise<void> {
  if (busy.current) return;
  busy.current = true;
  try {
    while (queue.current.length) {
      const next = queue.current.shift();
      if (!next) continue;
      try {
        await handle(next);
      } catch {
        /* one failed lookup must not freeze every following scan */
      }
    }
  } finally {
    busy.current = false;
    if (queue.current.length) void drainScanQueue(queue, busy, handle);
  }
}

export function enqueueScan(
  raw: string,
  last: { current: { code: string; at: number } },
  queue: { current: string[] },
  busy: { current: boolean },
  handle: (payload: string) => Promise<void>,
  debounceMs = SCAN_DEBOUNCE_MS,
): void {
  const payload = (raw ?? "").trim();
  if (!payload) return;
  const now = Date.now();
  if (payload === last.current.code && now - last.current.at < debounceMs) return;
  last.current = { code: payload, at: now };
  queue.current.push(payload);
  void drainScanQueue(queue, busy, handle);
}

export type CachedGroup = {
  sku: string;
  name: string;
  price: number;
  wholesale: number;
  mrp: number;
  qty: number;
  packQty: number;
};

const GRP_CACHE_KEY = "aj_pos_grp_cache_v1";

function readGroupCache(storage?: Storage | null): Record<string, CachedGroup> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(GRP_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function rememberGroupScan(code: string, item: CachedGroup, storage?: Storage | null): void {
  const key = (code ?? "").trim().toUpperCase();
  if (!key || item.packQty < 1 || !item.sku) return;
  const store = storage ?? (typeof sessionStorage === "undefined" ? null : sessionStorage);
  if (!store) return;
  try {
    const all = readGroupCache(store);
    all[key] = item;
    store.setItem(GRP_CACHE_KEY, JSON.stringify(all));
  } catch { /* quota / private mode */ }
}

export function recallGroupScan(code: string, storage?: Storage | null): CachedGroup | null {
  const key = (code ?? "").trim().toUpperCase();
  if (!key) return null;
  const store = storage ?? (typeof sessionStorage === "undefined" ? null : sessionStorage);
  const hit = readGroupCache(store)[key];
  if (!hit?.sku || !(hit.packQty >= 1)) return null;
  return hit;
}

/** BOX:SKU:N is self-contained — resolve against the in-memory catalogue without a server trip. */
export function localBoxFromCatalog<T extends { sku: string }>(
  raw: string,
  findExact: (codes: string[]) => T | undefined,
): { item: T; packQty: number; code: string } | null {
  const parsed = parseGroupScan(raw);
  if (parsed?.kind !== "box") return null;
  const item = findExact(skuCandidatesFromScan(parsed.sku));
  if (!item) return null;
  return { item, packQty: parsed.packQty, code: parsed.code };
}
