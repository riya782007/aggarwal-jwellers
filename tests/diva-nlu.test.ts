import { describe, it, expect } from "vitest";
import {
  detectLanguage, extractSku, extractQuantity, extractPriceRupees, extractColor,
  extractSubject, interpret, extractItemList, type DivaContext,
} from "../lib/diva/nlu";

// Helper: the tool of the first planned step.
const firstTool = (cmd: string, ctx?: DivaContext) => interpret(cmd, ctx).steps[0]?.tool;

describe("language detection", () => {
  it("plain English", () => expect(detectLanguage("show me this week's sales")).toBe("en"));
  it("Devanagari Hindi", () => expect(detectLanguage("बीस ऑक्सीडाइज़ नेकलेस का स्टॉक जोड़ो")).toBe("hi"));
  it("Hinglish (romanised)", () => expect(detectLanguage("20 oxidised necklace ka stock add kar do")).toBe("hinglish"));
  it("mixed Devanagari + latin is hinglish", () => expect(detectLanguage("AJ1001 का photo dikhao")).toBe("hinglish"));
});

describe("entity extraction", () => {
  it("SKU with and without prefix word", () => {
    expect(extractSku("SKU AJ1001 ka photo dikhao")).toBe("AJ1001");
    expect(extractSku("hide aj1003 please")).toBe("AJ1003");
    expect(extractSku("no sku here")).toBeUndefined();
  });
  it("quantity from digits and Hindi number-words", () => {
    expect(extractQuantity("add 20 pieces")).toBe(20);
    expect(extractQuantity("bees necklace add karo")).toBe(20);
    expect(extractQuantity("pachas pieces add karo")).toBe(50);
  });
  it("Devanagari digits", () => expect(extractQuantity("२० pieces add karo")).toBe(20));
  it("price near cue", () => {
    expect(extractPriceRupees("isko 800 ka kardo")).toBe(800);
    expect(extractPriceRupees("price ₹1499")).toBe(1499);
  });
  it("colour in English and Hindi", () => {
    expect(extractColor("blue kundan necklace")).toBe("blue");
    expect(extractColor("laal choker")).toBe("red");
  });
  it("subject phrase", () => {
    expect(extractSubject("20 oxidised necklace ka stock add kar do")).toContain("oxidised necklace");
  });
});

describe("intent → tool mapping (the client's example commands)", () => {
  it("add stock by name (Hinglish)", () => {
    const p = interpret("20 oxidised necklace ka stock add kar do");
    expect(p.steps[0].tool).toBe("add_stock_by_name");
    expect(p.steps[0].args.qty).toBe(20);
  });
  it("inventory query by name", () => {
    expect(firstTool("Blue kundan necklace ka inventory kitna hai?")).toBe("inventory_of");
  });
  it("price query with 'ye product' uses memory", () => {
    const ctx: DivaContext = { lastSku: "AJ1004" };
    const p = interpret("Ye product wholesale me kitne ka hai?", ctx);
    expect(p.steps[0].tool).toBe("get_price");
    expect(p.steps[0].args.sku).toBe("AJ1004");
    expect(p.steps[0].args.tier).toBe("wholesale");
  });
  it("show photo for a SKU", () => {
    expect(firstTool("SKU AJ1001 ka photo dikhao")).toBe("product_details");
  });
  it("share catalogue on whatsapp", () => {
    const p = interpret("Oxidised necklace ka catalog whatsapp pe bhejo");
    expect(p.steps[0].tool).toBe("share_catalog");
    expect(p.steps[0].args.whatsapp).toBe(true);
  });
  it("make a customer wholesale", () => {
    const p = interpret("Customer Ravi ko wholesale bana do");
    expect(p.steps[0].tool).toBe("set_customer_type");
    expect(p.steps[0].args.name).toBe("Ravi");
    expect(p.steps[0].args.type).toBe("wholesale");
  });
  it("pending orders", () => {
    expect(firstTool("Pending orders dikhao")).toBe("pending_orders");
  });
  it("create GST invoice opens billing", () => {
    expect(firstTool("GST invoice bana do")).toBe("open_page");
  });
  it("convert cash memo to GST", () => {
    expect(firstTool("Is bill ko cash memo se GST invoice me convert karo")).toBe("convert_invoice");
  });
  it("set an explicit retail price", () => {
    const p = interpret("AJ1004 ka retail price 1500 kar do");
    expect(p.steps[0].tool).toBe("set_price");
    expect(p.steps[0].args).toMatchObject({ sku: "AJ1004", price: 1500, tier: "retail" });
  });
  it("set an explicit wholesale price", () => {
    const p = interpret("set wholesale price 800 for AJ1010");
    expect(p.steps[0].tool).toBe("set_price");
    expect(p.steps[0].args).toMatchObject({ sku: "AJ1010", tier: "wholesale" });
  });
  it("record damaged stock", () => {
    const p = interpret("AJ1004 ka 2 piece damage ho gaya");
    expect(p.steps[0].tool).toBe("record_damage");
    expect(p.steps[0].args).toMatchObject({ sku: "AJ1004", qty: 2 });
  });
});

describe("intent edge cases", () => {
  it("create category is not mistaken for create product", () => {
    const p = interpret("create category Anklets");
    expect(p.steps[0]?.tool).toBe("create_category");
  });
  it("create subcategory", () => {
    expect(firstTool("create subcategory Oxidised under Necklaces")).toBe("create_subcategory");
  });
  it("find a customer by name", () => {
    const p = interpret("customer Ravi ka detail");
    expect(p.steps[0].tool).toBe("find_customer");
    expect(p.steps[0].args.query).toBe("Ravi");
  });
  it("hide a product", () => {
    expect(firstTool("hide AJ1099")).toBe("hide_product");
  });
  it("this week's sales", () => {
    const p = interpret("show me this week's sales");
    expect(p.steps[0].tool).toBe("analyze_sales");
    expect(p.steps[0].args.days).toBe(7);
  });
  it("business summary", () => {
    expect(firstTool("how is business doing")).toBe("business_summary");
  });
  it("navigation", () => {
    expect(firstTool("open inventory")).toBe("open_page");
    expect(firstTool("billing kholo")).toBe("open_page");
  });
});

describe("multi-turn create product (conversational memory)", () => {
  it("collects name → category → price → qty, then creates", () => {
    // Turn 1: starts the flow, asks for the name (no subject yet)
    let p = interpret("New product create karo");
    expect(p.ask?.slot).toBe("name");

    // Turn 2: name → asks category
    p = interpret("Oxidised Choker", p.context);
    expect(p.ask?.slot).toBe("category");

    // Turn 3: category → asks price
    p = interpret("Necklaces", p.context);
    expect(p.ask?.slot).toBe("price");

    // Turn 4: price → asks qty
    p = interpret("800", p.context);
    expect(p.ask?.slot).toBe("qty");

    // Turn 5: qty → ready to create
    p = interpret("20 pieces", p.context);
    expect(p.steps[0]?.tool).toBe("create_product");
    expect(p.steps[0].args).toMatchObject({ category: "Necklaces", price: 800, qty: 20 });
    expect(String(p.steps[0].args.name).toLowerCase()).toContain("choker");
  });

  it("can be cancelled mid-flow", () => {
    let p = interpret("create a new necklace");
    p = interpret("cancel", p.context);
    expect(p.steps.length).toBe(0);
    expect(p.context.pending).toBeUndefined();
  });
});

describe("stock slot-filling", () => {
  it("asks for quantity when only a SKU is given", () => {
    const p = interpret("AJ1010 me stock add karo");
    expect(p.ask?.slot).toBe("qty");
    const p2 = interpret("30", p.context);
    expect(p2.steps[0].tool).toBe("add_stock");
    expect(p2.steps[0].args).toMatchObject({ sku: "AJ1010", qty: 30 });
  });
});

describe("graceful fallback", () => {
  it("unknown input returns no steps and low confidence", () => {
    const p = interpret("asdfghjkl");
    expect(p.steps.length).toBe(0);
    expect(p.confidence).toBeLessThan(0.45);
  });
});


describe("Step 4 — admin reach & B2B (Aggarwal Ji)", () => {
  it("SKU digits are no longer mistaken for the price", () => {
    const p = interpret("AJ1004 ka retail price 1500 kar do");
    expect(p.steps[0]?.tool).toBe("set_price");
    expect(p.steps[0]?.args.price).toBe(1500);
  });
  it("bulk stock across several SKUs emits one step each", () => {
    const p = interpret("AJ1004 AJ1006 AJ1010 me 50 add karo");
    expect(p.steps.length).toBe(3);
    expect(p.steps.every((s) => s.tool === "add_stock")).toBe(true);
    expect(p.steps.map((s) => s.args.sku)).toEqual(["AJ1004", "AJ1006", "AJ1010"]);
    expect(p.steps[0].args.qty).toBe(50);
  });
  it("parses item lists for an estimate", () => {
    expect(extractItemList("AJ1004 ka 5, AJ1006 ka 3")).toEqual([
      { sku: "AJ1004", qty: 5 }, { sku: "AJ1006", qty: 3 },
    ]);
  });
  it("builds an estimate from item lines + customer", () => {
    const p = interpret("AJ1004 ka 5 aur AJ1006 ka 3 ka estimate Ravi ke liye banao");
    expect(p.steps[0]?.tool).toBe("create_estimate");
    expect(p.steps[0]?.args.items).toEqual([{ sku: "AJ1004", qty: 5 }, { sku: "AJ1006", qty: 3 }]);
    expect(String(p.steps[0]?.args.customer).toLowerCase()).toContain("ravi");
  });
  it("a bare estimate request just opens the estimates page", () => {
    expect(interpret("estimate banao").steps[0]?.tool).toBe("open_page");
  });
  it("party ledger / outstanding", () => {
    expect(interpret("kis party ka kitna baaki hai").steps[0]?.tool).toBe("outstanding");
    expect(interpret("show outstanding").steps[0]?.tool).toBe("outstanding");
    expect(interpret("pending orders dikhao").steps[0]?.tool).toBe("pending_orders");
  });
  it("wholesale rate list, pending retailers, approve retailer", () => {
    expect(interpret("oxidised necklace ka rate list retailers ko bhejo").steps[0]?.tool).toBe("rate_list");
    expect(interpret("show pending retailers").steps[0]?.tool).toBe("pending_retailers");
    const a = interpret("approve retailer Sharma Jewellers");
    expect(a.steps[0]?.tool).toBe("approve_retailer");
    expect(String(a.steps[0]?.args.name).toLowerCase()).toContain("sharma");
    expect(interpret("approve the retailer account").ask?.slot).toBe("retailer_name");
  });
});
