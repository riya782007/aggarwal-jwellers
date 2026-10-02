/**
 * Counter-side SKU matching — the one place POS, Estimates and the server agree on what a scanned
 * sticker means. Pure (no DOM, no DB) so every rule here is unit-tested.
 *
 * Order of trust, most to least:
 *   1. exact SKU (case-insensitive), across every spelling skuCandidatesFromScan produces
 *   2. a known OLD SKU (sku_aliases) — stickers printed before the product's SKU was renamed
 *   3. separator-blind match ("…-2.10" ↔ "…-210", stray NBSP/en-dash from an Excel import),
 *      accepted ONLY when exactly one item has that spelling so two items can never be confused
 */
import { normalizeScanPayload, skuCandidatesFromScan } from "./scan";

/** Upper-case letters and digits only: "ajdh-1931 ", "AJDH–1931", "AJDH.1931" → "AJDH1931". */
export function canonicalSku(raw: string): string {
  return normalizeScanPayload(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Longest letters/digits run — a cheap `ilike %token%` pre-filter for the server's fallback. */
export function longestSkuToken(raw: string): string {
  const parts = normalizeScanPayload(raw ?? "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  return parts.sort((a, b) => b.length - a.length)[0] ?? "";
}

/** Shortest canonical form we trust for a separator-blind match (avoids "A1" ≈ "A-1" noise). */
export const CANONICAL_MIN = 4;

export type SkuMatchVia = "exact" | "alias" | "canonical";

export type SkuIndex<T extends { sku: string }> = {
  exact: Map<string, T>;
  canonical: Map<string, T[]>;
  /** OLD sku (lower-case) → CURRENT sku */
  alias: Map<string, string>;
};

export function buildSkuIndex<T extends { sku: string }>(items: T[], aliases: Record<string, string> = {}): SkuIndex<T> {
  const exact = new Map<string, T>();
  const canonical = new Map<string, T[]>();
  for (const it of items) {
    if (!it?.sku) continue;
    exact.set(it.sku.toLowerCase(), it);
    const k = canonicalSku(it.sku);
    if (k.length < CANONICAL_MIN) continue;
    const list = canonical.get(k);
    if (list) list.push(it); else canonical.set(k, [it]);
  }
  const alias = new Map<string, string>();
  for (const [oldSku, current] of Object.entries(aliases ?? {})) {
    const o = (oldSku ?? "").trim().toLowerCase();
    // A live SKU always wins over an alias that happens to share its spelling.
    if (o && current && !exact.has(o)) alias.set(o, current);
  }
  return { exact, canonical, alias };
}

/**
 * Resolve a raw scan (or a list of candidate spellings) against an index.
 * `canonical: false` for the counter's in-memory list: that list can lag the database (an item
 * added after Billing opened), so "the only similar SKU I know of" isn't proof — the server, which
 * sees every row, makes separator-blind calls instead.
 */
export function matchSku<T extends { sku: string }>(
  index: SkuIndex<T>,
  rawOrCodes: string | string[],
  opts: { canonical?: boolean } = {},
): { item: T; via: SkuMatchVia } | null {
  const codes = Array.isArray(rawOrCodes) ? rawOrCodes : skuCandidatesFromScan(rawOrCodes);
  for (const c of codes) {
    const hit = index.exact.get(c.toLowerCase());
    if (hit) return { item: hit, via: "exact" };
  }
  for (const c of codes) {
    const current = index.alias.get(c.toLowerCase());
    const hit = current ? index.exact.get(current.toLowerCase()) : undefined;
    if (hit) return { item: hit, via: "alias" };
  }
  if (opts.canonical === false) return null;
  for (const c of codes) {
    const k = canonicalSku(c);
    if (k.length < CANONICAL_MIN) continue;
    const hits = index.canonical.get(k);
    if (hits && hits.length === 1) return { item: hits[0], via: "canonical" };
  }
  return null;
}

/** Up to `limit` catalogue SKUs that share the scan's design code — "did you mean" chips. */
export function suggestSkus<T extends { sku: string }>(items: T[], raw: string, limit = 6): string[] {
  const token = longestSkuToken(raw).toUpperCase();
  if (token.length < CANONICAL_MIN) return [];
  const out: string[] = [];
  for (const it of items) {
    if (it.sku && it.sku.toUpperCase().includes(token)) out.push(it.sku);
    if (out.length >= limit * 4) break;
  }
  return [...new Set(out)].sort().slice(0, limit);
}

/** "STONE 4PC BANGLE · Red · 2.10" — a variant line must say WHICH colour / size / polish it is. */
export function variantLabel(name: string, v: { color?: string | null; size?: string | null; polish?: string | null }): string {
  const bits = [v.color, v.size, v.polish].map((x) => String(x ?? "").trim()).filter(Boolean);
  return bits.length ? `${name} · ${bits.join(" · ")}` : name;
}
