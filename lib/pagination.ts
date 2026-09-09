/**
 * lib/pagination.ts — paging past PostgREST's 1000-row cap (0049).
 *
 * A plain PostgREST select returns at most 1000 rows and reports NO error when it truncates.
 * Any read that must cover a whole table has to page, or it silently works right up until the
 * table crosses 1000 rows and then quietly starts hiding data. That is exactly what happened to
 * the labels list: ordered by `sku`, so once the catalogue passed 1000 products every newly
 * added SKU sorted past the cap and could not be printed — with nothing in the logs.
 *
 * Kept in its own DOM-free, server-only-free module so it can be unit tested; `allRows` is
 * re-exported from lib/supabase/queries.ts, which is where callers have always imported it.
 */

/** Page through PostgREST's 1000-row cap (0049) — use for any product/order-wide read. */
export async function allRows<T = any>(makeQuery: () => any, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    // On a mid-run error, return what we already have rather than throwing: a partial catalogue
    // still lets the counter work, and callers treat an empty result as "fall back".
    if (error || !data?.length) break;
    out.push(...(data as T[]));
    if ((data as T[]).length < pageSize) break;
  }
  return out;
}
