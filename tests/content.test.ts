import { describe, it, expect } from "vitest";
import { resolveProductContent, templateContent } from "../lib/content";

describe("content resolver (no model on request path)", () => {
  it("uses cached generated_content when present", () => {
    const c = resolveProductContent({
      name: "Kundan Set", sku: "KS1",
      generated_content: { title: "Cached", description: "d", specs: {}, tags: [], seo: { metaTitle: "m", metaDescription: "md", keywords: [] } },
    });
    expect(c.title).toBe("Cached");
  });
  it("falls back to deterministic template when no cache", () => {
    const c = resolveProductContent({ name: "Anklet Pair", sku: "AP1", categoryName: "Anklet", colors: ["Gold", "Silver"] });
    // House style: titles start with a unique Indian first name (stable per SKU) and end with the
    // jewellery type — e.g. "Diya Anklet". Assert the structure, not one specific name.
    expect(c.title).toMatch(/^[A-Z][a-z]+ .*Anklet/);
    expect(c.title.length).toBeGreaterThan(5);
    expect(c.description).toContain("Aggarwal Jewellers");
    expect(c.description.length).toBeGreaterThan(100);
    expect(c.seo.keywords).toContain("Delhi");
    expect(c.specs.Colours).toBe("Gold, Silver");
  });
  it("never returns empty content", () => {
    const c = templateContent({ name: "X", sku: "X1" });
    expect(c.title.length).toBeGreaterThan(0);
    expect(c.description.length).toBeGreaterThan(0);
  });
});
