/**
 * lib/billGroups.ts — order printed bill lines CATEGORY-WISE (owner request): all earrings together,
 * all necklaces together, … instead of one long A–Z SKU list.
 *
 * - Groups follow the catalogue's own category order (categories.sort, then name), so the bill
 *   reads in the same order as the shop's catalogue. Lines with no category go last, as "Other".
 * - Inside a group, lines stay A–Z by SKU (the old order), so picking/checking is still predictable.
 * - Pure and DOM-free: only the ORDER of lines changes, never qty, rate or amount.
 */

export type BillCategory = { name?: string | null; sort?: number | null } | null | undefined;

export type BillGroup<T> = { category: string; items: T[] };

export const OTHER_CATEGORY = "Other";

function lineSku(it: any): string {
  return String(it?.variant?.sku ?? it?.product?.sku ?? "");
}

function lineCategory(it: any): BillCategory {
  const c = it?.product?.category;
  return Array.isArray(c) ? c[0] : c;
}

export function groupBillLines<T>(lines: T[]): BillGroup<T>[] {
  const groups = new Map<string, { category: string; sort: number; uncategorised: boolean; items: T[] }>();
  for (const it of lines) {
    const cat = lineCategory(it);
    const name = String(cat?.name ?? "").trim();
    const key = name ? name.toLowerCase() : "";
    let g = groups.get(key);
    if (!g) {
      g = { category: name || OTHER_CATEGORY, sort: Number(cat?.sort ?? 0) || 0, uncategorised: !name, items: [] };
      groups.set(key, g);
    }
    g.items.push(it);
  }
  return [...groups.values()]
    .sort((a, b) =>
      (a.uncategorised ? 1 : 0) - (b.uncategorised ? 1 : 0) ||
      a.sort - b.sort ||
      a.category.localeCompare(b.category))
    .map((g) => ({
      category: g.category,
      items: [...g.items].sort((x, y) => lineSku(x).localeCompare(lineSku(y))),
    }));
}
