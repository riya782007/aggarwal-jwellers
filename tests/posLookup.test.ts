import { describe, expect, it } from "vitest";
import {
  drainScanQueue,
  enqueueScan,
  isTransientPosError,
  localBoxFromCatalog,
  localGroupFromIndex,
  recallGroupScan,
  rememberGroupScan,
  retryLookup,
  withTimeout,
} from "../lib/posLookup";

function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear() { map.clear(); },
    getItem(key: string) { return map.has(key) ? map.get(key)! : null; },
    key(i: number) { return [...map.keys()][i] ?? null; },
    removeItem(key: string) { map.delete(key); },
    setItem(key: string, value: string) { map.set(key, value); },
  };
}

describe("POS lookup timeout and retry", () => {
  it("aborts a hung lookup instead of waiting forever", async () => {
    await expect(withTimeout(new Promise(() => {}), 40, "box QR")).rejects.toThrow("box QR timed out");
  });

  it("retries a transient failure and then succeeds", async () => {
    let n = 0;
    const value = await retryLookup(async () => {
      n += 1;
      if (n === 1) throw new Error("503 Service Unavailable");
      return "ok";
    }, { tries: 2, timeoutMs: 200, label: "SKU" });
    expect(value).toBe("ok");
    expect(n).toBe(2);
  });

  it("does not retry a non-transient error", async () => {
    let n = 0;
    await expect(
      retryLookup(async () => {
        n += 1;
        throw new Error("Box product missing.");
      }, { tries: 3, timeoutMs: 200, label: "box QR" }),
    ).rejects.toThrow("Box product missing.");
    expect(n).toBe(1);
  });

  it("classifies cold-start / network / HTML-as-JSON failures as transient", () => {
    expect(isTransientPosError(new Error("box QR timed out"))).toBe(true);
    expect(isTransientPosError(new Error("Failed to fetch"))).toBe(true);
    expect(isTransientPosError(new Error("Unexpected token < in JSON at position 0"))).toBe(true);
    expect(isTransientPosError(new Error("503"))).toBe(true);
    expect(isTransientPosError(new Error("Box QR not recognised"))).toBe(false);
  });
});

describe("scan queue drain", () => {
  it("keeps draining after one lookup throws — the freeze Jatin hit at the counter", async () => {
    const handled: string[] = [];
    const queue = { current: ["GRP-DEAD", "AJDH1931", "BOX:AJDH1931:12"] };
    const busy = { current: false };
    await drainScanQueue(queue, busy, async (payload) => {
      handled.push(payload);
      if (payload === "GRP-DEAD") throw new Error("lookup timed out");
    });
    expect(handled).toEqual(["GRP-DEAD", "AJDH1931", "BOX:AJDH1931:12"]);
    expect(queue.current).toEqual([]);
    expect(busy.current).toBe(false);
  });

  it("a hung lookup that times out still lets the next sticker through", async () => {
    const handled: string[] = [];
    const queue = { current: ["slow", "fast"] };
    const busy = { current: false };
    await drainScanQueue(queue, busy, async (payload) => {
      handled.push(payload);
      if (payload === "slow") {
        await retryLookup(() => new Promise(() => {}), { tries: 2, timeoutMs: 25, label: "hung" });
      }
    });
    expect(handled).toEqual(["slow", "fast"]);
    expect(busy.current).toBe(false);
  });

  it("debounces a double-fire of the same sticker", async () => {
    const handled: string[] = [];
    const last = { current: { code: "", at: 0 } };
    const queue = { current: [] as string[] };
    const busy = { current: false };
    const handle = async (payload: string) => { handled.push(payload); };
    enqueueScan("AJDH1931", last, queue, busy, handle, 140);
    enqueueScan("AJDH1931", last, queue, busy, handle, 140);
    enqueueScan("AJ1004", last, queue, busy, handle, 140);
    await new Promise((r) => setTimeout(r, 30));
    expect(handled).toEqual(["AJDH1931", "AJ1004"]);
  });
});

describe("local BOX: resolution and GRP cache", () => {
  const catalog = [{ sku: "AJDH1931", name: "Dhwani Earrings" }];
  const findExact = (codes: string[]) =>
    catalog.find((p) => codes.some((c) => c.toLowerCase() === p.sku.toLowerCase()));

  it("resolves a shelf BOX:SKU:N sticker from the in-memory catalogue (no server)", () => {
    expect(localBoxFromCatalog("BOX:AJDH1931:12", findExact)).toEqual({
      item: catalog[0],
      packQty: 12,
      code: "BOX:AJDH1931:12",
    });
    expect(localBoxFromCatalog("BOX;AJDH1931;12", findExact)?.packQty).toBe(12);
    expect(localBoxFromCatalog("https://aggarwaljewellers.in/g/BOX:AJDH1931:12", findExact)?.code).toBe("BOX:AJDH1931:12");
  });

  it("does not treat a piece SKU or a GRP- code as a local box", () => {
    expect(localBoxFromCatalog("AJDH1931", findExact)).toBeNull();
    expect(localBoxFromCatalog("GRP-AB12CD", findExact)).toBeNull();
    expect(localBoxFromCatalog("BOX:UNKNOWN:6", findExact)).toBeNull();
  });

  it("remembers a successful GRP- lookup for the rest of the tab", () => {
    const store = memStorage();
    const item = {
      sku: "AJDH1931",
      name: "Dhwani Earrings",
      price: 45000,
      wholesale: 38000,
      mrp: 52000,
      qty: 24,
      packQty: 12,
    };
    rememberGroupScan("grp-ab12cd", item, store);
    expect(recallGroupScan("GRP-AB12CD", store)).toEqual(item);
    expect(recallGroupScan("GRP-NOPE", store)).toBeNull();
  });
});

describe("GRP- box index (no server trip)", () => {
  const catalog = [{ sku: "AJDH1931", name: "Dhwani Earrings" }];
  const findExact = (codes: string[]) =>
    catalog.find((p) => codes.some((c) => c.toLowerCase() === p.sku.toLowerCase()));
  const boxes = { "GRP-AB12CD": { sku: "AJDH1931", packQty: 12 } };

  it("resolves a printed GRP- sticker from the page's box index", () => {
    expect(localGroupFromIndex("GRP-AB12CD", boxes, findExact)).toEqual({ item: catalog[0], packQty: 12, code: "GRP-AB12CD" });
    expect(localGroupFromIndex("grpab12cd", boxes, findExact)?.packQty).toBe(12); // wedge dropped the hyphen
    expect(localGroupFromIndex("https://aggarwaljewellers.in/g/GRP-AB12CD", boxes, findExact)?.item).toBe(catalog[0]);
  });

  it("falls through for unknown codes, BOX: payloads and piece SKUs", () => {
    expect(localGroupFromIndex("GRP-NOPE01", boxes, findExact)).toBeNull();
    expect(localGroupFromIndex("BOX:AJDH1931:12", boxes, findExact)).toBeNull();
    expect(localGroupFromIndex("AJDH1931", boxes, findExact)).toBeNull();
    expect(localGroupFromIndex("GRP-AB12CD", undefined, findExact)).toBeNull();
  });
});
