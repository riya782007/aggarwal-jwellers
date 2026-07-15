import { describe, it, expect } from "vitest";
import { orderGrandPaise, orderDuePaise, isDeadOrder } from "../lib/business";

/** The ONE receivables formula (mirrored in SQL by order_grand_paise / migration 0045). */
describe("orderGrandPaise / orderDuePaise — single source of truth", () => {
  it("cash memo: grand = total", () => {
    expect(orderGrandPaise({ total: 100000, bill_type: "cash" })).toBe(100000);
  });

  it("GST bill (exclusive/auto): grand = total + 3%, rounded to ₹1", () => {
    // ₹1000.00 → +₹30 GST → ₹1030.00
    expect(orderGrandPaise({ total: 100000, bill_type: "gst" })).toBe(103000);
    expect(orderGrandPaise({ total: 100000, bill_type: "gst", gst_mode: "exclusive" })).toBe(103000);
    // rounding to nearest ₹1: ₹333.33 + 3% = ₹343.33 → ₹343
    expect(orderGrandPaise({ total: 33333, bill_type: "gst" })).toBe(34300);
  });

  it("GST bill pinned inclusive: grand = total (already tax-inclusive)", () => {
    expect(orderGrandPaise({ total: 103000, bill_type: "gst", gst_mode: "inclusive" })).toBe(103000);
  });

  it("returns reduce the grand total BEFORE grossing up GST", () => {
    // ₹1000 bill, ₹200 returned → ₹800 + 3% = ₹824
    expect(orderGrandPaise({ total: 100000, bill_type: "gst", return_amount: 20000 })).toBe(82400);
    // fully returned → nothing payable
    expect(orderGrandPaise({ total: 100000, bill_type: "gst", return_amount: 100000 })).toBe(0);
  });

  it("due = grand − paid, clamped at 0 (the ₹1000-vs-₹1180 class of bug)", () => {
    // unpaid GST bill owes the GRAND total, not the pre-tax total
    expect(orderDuePaise({ total: 100000, bill_type: "gst", amount_paid: 0 })).toBe(103000);
    // paying the pre-tax figure leaves exactly the GST outstanding
    expect(orderDuePaise({ total: 100000, bill_type: "gst", amount_paid: 100000 })).toBe(3000);
    // fully-paid GST bill (cap trigger stores the grand) → zero due
    expect(orderDuePaise({ total: 100000, bill_type: "gst", amount_paid: 103000 })).toBe(0);
    // over-paid never goes negative
    expect(orderDuePaise({ total: 100000, bill_type: "cash", amount_paid: 120000 })).toBe(0);
  });

  it("partial return on a partly-paid bill nets out correctly", () => {
    // ₹1000 GST bill, ₹500 paid, then ₹300 of goods returned:
    // grand = (1000−300)×1.03 = ₹721 → due = 721 − 500 = ₹221
    expect(orderDuePaise({ total: 100000, bill_type: "gst", amount_paid: 50000, return_amount: 30000 })).toBe(22100);
  });

  it("dead orders are recognised", () => {
    expect(isDeadOrder("cancelled")).toBe(true);
    expect(isDeadOrder("void")).toBe(true);
    expect(isDeadOrder("refunded")).toBe(true);
    expect(isDeadOrder("completed")).toBe(false);
    expect(isDeadOrder(null)).toBe(false);
  });
});
