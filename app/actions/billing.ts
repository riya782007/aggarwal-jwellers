"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { requirePerm } from "@/lib/auth";
import { getPricingFormula } from "@/lib/supabase/queries";
import { resolvePrices, overridesOf } from "@/lib/pricing";
import { estimateStatusAfterBill, isBilledEstimate, isOpenEstimate } from "@/lib/estimates";

/**
 * Resolve a single SKU (product OR variant) to a billable line, straight from the DB.
 * The POS holds an in-memory catalogue list for fast search, but that list can lag or miss an
 * item (e.g. a colour variant, a just-added product). When the counter enters a SKU the list
 * doesn't have, POS calls this so a REAL sku is never wrongly shown as "product not found".
 * Read-only; matches SKU case-insensitively and exactly.
 */
export async function resolveSellableSku(
  skuRaw: string,
): Promise<{ sku: string; name: string; price: number; wholesale: number; mrp: number; qty: number; category: string } | null> {
  try {
    const sku = (skuRaw || "").trim();
    if (!sku) return null;
    const sb = supabaseServer();
    const formula = await getPricingFormula();

    // 1) exact PRODUCT sku
    const { data: prod } = await sb
      .from("products")
      .select("sku,name,base_wholesale,qty,wholesale_override,retail_override,mrp_override")
      .ilike("sku", sku).limit(1).maybeSingle();
    if (prod) {
      const p: any = prod;
      const ps = resolvePrices(p.base_wholesale, formula, overridesOf(p));
      return { sku: p.sku, name: p.name, price: ps.retailPrice, wholesale: ps.wholesaleRate, mrp: ps.mrp, qty: p.qty ?? 0, category: "" };
    }

    // 2) exact VARIANT sku → bill the variant, priced off its parent product + its own overrides
    const { data: variant } = await sb
      .from("variants")
      .select("sku,color,qty,wholesale_override,retail_override,mrp_override, product:products(sku,name,base_wholesale,wholesale_override,retail_override,mrp_override)")
      .ilike("sku", sku).limit(1).maybeSingle();
    if (variant) {
      const v: any = variant;
      const p = v.product;
      if (!p) return null;
      const ps = resolvePrices(p.base_wholesale, formula, overridesOf(v), overridesOf(p));
      return { sku: v.sku, name: `${p.name}${v.color ? " · " + v.color : ""}`, price: ps.retailPrice, wholesale: ps.wholesaleRate, mrp: ps.mrp, qty: v.qty ?? 0, category: "" };
    }

    return null;
  } catch {
    return null;
  }
}

/** Recompute an estimate's total from its current line items. */
async function recomputeEstimateTotal(sb: ReturnType<typeof supabaseServer>, estimateId: string) {
  const { data } = await sb.from("estimate_items").select("line_total").eq("estimate_id", estimateId);
  const items = ((data as any[]) ?? []).reduce((s, r) => s + (r.line_total ?? 0), 0);
  // Fold in the estimate's extra charges (Packing/Courier/Adjustment) so the quote total — and
  // the bill it converts to — matches the screen. Columns absent pre-migration ⇒ treated as 0.
  let charges = 0;
  const { data: est } = await sb.from("estimates").select("extra_packing,extra_courier,extra_adjustment").eq("id", estimateId).maybeSingle();
  if (est) charges = (((est as any).extra_packing) || 0) + (((est as any).extra_courier) || 0) + (((est as any).extra_adjustment) || 0);
  await sb.from("estimates").update({ total: items + charges }).eq("id", estimateId);
}

/** #18: edit an open estimate — customer details + salesperson / GSTIN (POS parity). */
export async function updateEstimateCustomerAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("estimates.create"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const sb = supabaseServer();
  const { data: est } = await sb.from("estimates").select("status,order_id").eq("id", id).maybeSingle();
  if (!isOpenEstimate((est as any)?.status, (est as any)?.order_id)) return;
  const name = String(formData.get("customer_name") ?? "").trim() || null;
  const phone = String(formData.get("customer_phone") ?? "").trim() || null;
  const salesEmployeeId = String(formData.get("sales_employee_id") ?? "").trim() || null;
  const buyerGstin = String(formData.get("buyer_gstin") ?? "").trim().toUpperCase() || null;
  const buyerAddress = String(formData.get("buyer_address") ?? "").trim() || null;
  const patch: Record<string, unknown> = { customer_name: name, customer_phone: phone };
  if (formData.has("sales_employee_id")) patch.sales_employee_id = salesEmployeeId;
  if (formData.has("buyer_gstin")) patch.buyer_gstin = buyerGstin;
  if (formData.has("buyer_address")) patch.buyer_address = buyerAddress;
  const { error } = await sb.from("estimates").update(patch).eq("id", id);
  if (error) console.warn("estimate customer update:", error.message);
  revalidatePath(`/admin/estimate/${id}`);
  revalidatePath("/admin/estimates");
}

/** #18: change a line's quantity on an open estimate. */
export async function updateEstimateLineAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("estimates.create"))) return;
  const itemId = String(formData.get("item_id") ?? "");
  const estimateId = String(formData.get("estimate_id") ?? "");
  const qty = Math.max(1, Math.floor(Number(formData.get("qty") ?? 1)));
  if (!itemId || !estimateId) return;
  const sb = supabaseServer();
  const { data: est } = await sb.from("estimates").select("status,order_id").eq("id", estimateId).maybeSingle();
  if (!isOpenEstimate((est as any)?.status, (est as any)?.order_id)) return;
  const { data: it } = await sb.from("estimate_items").select("unit_price").eq("id", itemId).maybeSingle();
  if (!it) return;
  await sb.from("estimate_items").update({ qty, line_total: (it as any).unit_price * qty }).eq("id", itemId);
  await recomputeEstimateTotal(sb, estimateId);
  revalidatePath(`/admin/estimate/${estimateId}`);
}

/** Pillar 4/15: edit a line's UNIT PRICE (₹) on an open estimate — the negotiated rate
 * is stored and carries straight through to the final bill on conversion. */
export async function updateEstimateLinePriceAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("estimates.create"))) return;
  const itemId = String(formData.get("item_id") ?? "");
  const estimateId = String(formData.get("estimate_id") ?? "");
  const rupees = Number(formData.get("price") ?? 0);
  if (!itemId || !estimateId || !Number.isFinite(rupees) || rupees < 0) return;
  const unit = Math.round(rupees * 100); // store paise
  const sb = supabaseServer();
  const { data: est } = await sb.from("estimates").select("status,order_id").eq("id", estimateId).maybeSingle();
  if (!isOpenEstimate((est as any)?.status, (est as any)?.order_id)) return;
  const { data: it } = await sb.from("estimate_items").select("qty").eq("id", itemId).maybeSingle();
  if (!it) return;
  await sb.from("estimate_items").update({ unit_price: unit, line_total: unit * (it as any).qty }).eq("id", itemId);
  await recomputeEstimateTotal(sb, estimateId);
  revalidatePath(`/admin/estimate/${estimateId}`);
}

/** #18: remove a line from an open estimate. */
export async function removeEstimateLineAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("estimates.create"))) return;
  const itemId = String(formData.get("item_id") ?? "");
  const estimateId = String(formData.get("estimate_id") ?? "");
  if (!itemId || !estimateId) return;
  const sb = supabaseServer();
  const { data: est } = await sb.from("estimates").select("status,order_id").eq("id", estimateId).maybeSingle();
  if (!isOpenEstimate((est as any)?.status, (est as any)?.order_id)) return;
  await sb.from("estimate_items").delete().eq("id", itemId);
  await recomputeEstimateTotal(sb, estimateId);
  revalidatePath(`/admin/estimate/${estimateId}`);
}

/** #18: add a line (by SKU, at the current retail price) to an open estimate. */
export async function addEstimateLineAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("estimates.create"))) return;
  const estimateId = String(formData.get("estimate_id") ?? "");
  const sku = String(formData.get("sku") ?? "").trim().toUpperCase();
  const qty = Math.max(1, Math.floor(Number(formData.get("qty") ?? 1)));
  if (!estimateId || !sku) return;
  const sb = supabaseServer();
  const { data: estLock } = await sb.from("estimates").select("status,order_id").eq("id", estimateId).maybeSingle();
  if (!isOpenEstimate((estLock as any)?.status, (estLock as any)?.order_id)) return;
  // Resolve the SKU to a specific variant first (so the estimate records the exact colour),
  // then fall back to a bare product SKU.
  const { data: v } = await sb.from("variants").select("id,product_id,wholesale_override,retail_override,product:products(base_wholesale,wholesale_override,retail_override,mrp_override)").ilike("sku", sku).maybeSingle();
  let productId: string, variantId: string | null = null, base: number, ov: any;
  if (v) {
    const vp = (v as any).product;
    productId = (v as any).product_id; variantId = (v as any).id; base = vp.base_wholesale;
    ov = { wholesale_override: (v as any).wholesale_override ?? vp.wholesale_override, retail_override: (v as any).retail_override ?? vp.retail_override, mrp_override: vp.mrp_override };
  } else {
    const { data: p } = await sb.from("products").select("id,base_wholesale,wholesale_override,retail_override,mrp_override").ilike("sku", sku).maybeSingle();
    if (!p) return;
    productId = (p as any).id; base = (p as any).base_wholesale; ov = overridesOf(p);
  }
  const formula = await getPricingFormula();
  const { data: estMeta } = await sb.from("estimates").select("price_tier").eq("id", estimateId).maybeSingle();
  const wholesale = (estMeta as any)?.price_tier === "wholesale";
  const ps = resolvePrices(base, formula, ov);
  const unit = wholesale && ps.wholesaleRate > 0 ? ps.wholesaleRate : ps.retailPrice;
  await sb.from("estimate_items").insert({ estimate_id: estimateId, product_id: productId, variant_id: variantId, qty, unit_price: unit, line_total: unit * qty });
  await recomputeEstimateTotal(sb, estimateId);
  revalidatePath(`/admin/estimate/${estimateId}`);
}

export async function createEstimateAction(input: {
  items: { sku: string; qty: number; priceRupees?: number }[];
  customer: { name?: string; phone?: string };
  packingRupees?: number; courierRupees?: number; adjustmentRupees?: number;
  salesEmployeeId?: string;
  buyerGstin?: string;
  buyerAddress?: string;
  mergeVariants?: boolean;
  tier?: "retail" | "wholesale";
}): Promise<{ ok: boolean; estimateId?: string; total?: number; error?: string }> {
  if (!(await requirePerm("estimates.create"))) return { ok: false, error: "Your role can't create estimates." };
  if (!input.items?.length) return { ok: false, error: "Add at least one item" };
  const salesEmployeeId = (input.salesEmployeeId ?? "").trim();
  if (!salesEmployeeId) return { ok: false, error: 'Pick who this quote is for under "Sold by" — or add their name — before saving.' };
  const sb = supabaseServer();
  const { data, error } = await sb.rpc("create_estimate", { p_items: input.items.map((i) => ({ sku: i.sku, qty: i.qty })), p_customer: input.customer ?? {} });
  if (error) return { ok: false, error: error.message };
  const estimateId = (data as any)?.estimate_id;
  let outTotal = (data as any)?.total as number | undefined;
  if (estimateId) {
    // Extra charges (best-effort; needs migration 0021). Adjustment may be ±.
    const xp = Math.max(0, Math.round((input.packingRupees ?? 0) * 100));
    const xc = Math.max(0, Math.round((input.courierRupees ?? 0) * 100));
    const xa = Math.round((input.adjustmentRupees ?? 0) * 100);
    const hasCharges = xp !== 0 || xc !== 0 || xa !== 0;
    if (hasCharges) {
      const { error: chErr } = await sb.from("estimates").update({ extra_packing: xp, extra_courier: xc, extra_adjustment: xa }).eq("id", estimateId);
      if (chErr) console.warn("estimate charges not saved — apply migration 0021_billing_charges.sql:", chErr.message);
    }
    // POS-parity metadata (salesperson, GSTIN, tier, merge-colours). Best-effort if columns lag.
    const ph = input.customer?.phone?.trim();
    const nm = input.customer?.name?.trim();
    let customerId: string | null = null;
    if (ph) {
      const { data: existing } = await sb.from("customers").select("id").eq("phone", ph).maybeSingle();
      if (existing) {
        customerId = (existing as any).id;
        const cpatch: Record<string, unknown> = {};
        if (nm) cpatch.name = nm;
        if (input.buyerGstin?.trim()) cpatch.gstin = input.buyerGstin.trim();
        if (Object.keys(cpatch).length) await sb.from("customers").update(cpatch).eq("id", customerId);
      } else {
        const { data: created } = await sb.from("customers")
          .insert({ name: nm || ph, phone: ph, gstin: input.buyerGstin?.trim() || null, address: input.buyerAddress?.trim() || null, type: input.tier === "wholesale" ? "wholesale" : "retail" })
          .select("id").maybeSingle();
        customerId = (created as any)?.id ?? null;
      }
    }
    const meta: Record<string, unknown> = {
      sales_employee_id: salesEmployeeId,
      merge_variants: !!input.mergeVariants,
      price_tier: input.tier === "wholesale" ? "wholesale" : "retail",
    };
    if (customerId) meta.customer_id = customerId;
    if (input.buyerGstin?.trim()) meta.buyer_gstin = input.buyerGstin.trim().toUpperCase();
    if (input.buyerAddress?.trim()) meta.buyer_address = input.buyerAddress.trim();
    if (input.customer?.phone) meta.customer_phone = input.customer.phone;
    const { error: metaErr } = await sb.from("estimates").update(meta).eq("id", estimateId);
    if (metaErr) console.warn("estimate POS metadata not saved — apply migration 0076_estimate_pos_parity.sql:", metaErr.message);
    // Apply the per-line rates the counter set (R/W tier or an edited rate) so the saved quote —
    // and the bill it converts to (convert uses estimate_items.unit_price) — matches the screen.
    // Match estimate_items back to the inputs by SKU.
    const priced = input.items.filter((i) => i.priceRupees != null && Number.isFinite(i.priceRupees) && (i.priceRupees as number) >= 0);
    if (priced.length) {
      const { data: its } = await sb.from("estimate_items").select("id, qty, product:products(sku), variant:variants(sku)").eq("estimate_id", estimateId);
      const bySku = new Map<string, { id: string; qty: number }>();
      for (const it of ((its as any[]) ?? [])) { const sku = (it as any).variant?.sku ?? (it as any).product?.sku; if (sku) bySku.set(String(sku).toUpperCase(), { id: it.id, qty: it.qty }); }
      for (const i of priced) {
        const m = bySku.get(i.sku.toUpperCase());
        if (!m) continue;
        const unit = Math.round((i.priceRupees as number) * 100);
        await sb.from("estimate_items").update({ unit_price: unit, line_total: unit * m.qty }).eq("id", m.id);
      }
    }
    if (priced.length || hasCharges) await recomputeEstimateTotal(sb, estimateId);
    // The RPC stores only the name; persist the phone too.
    if (input.customer?.phone) await sb.from("estimates").update({ customer_phone: input.customer.phone }).eq("id", estimateId);
    const { data: est } = await sb.from("estimates").select("total").eq("id", estimateId).maybeSingle();
    if (est) outTotal = (est as any).total;
  }
  revalidatePath("/admin/estimates");
  return { ok: true, estimateId, total: outTotal };
}

export async function convertEstimateAction(formData: FormData) {
  if (!(await requirePerm("estimates.bill"))) return;
  const id = String(formData.get("id"));
  await supabaseServer().rpc("convert_estimate", { p_estimate_id: id });
  revalidatePath("/admin/estimates"); revalidatePath("/admin/dashboard");
}

/**
 * Bill an estimate. p_bill_type "gst" → tax invoice, "cash" → cash memo.
 * Decrements stock, posts to the ledger, links the order, then opens the bill.
 */
export async function billEstimateAction(formData: FormData) {
  if (!(await requirePerm("estimates.bill"))) redirect("/admin/estimates");
  const id = String(formData.get("id"));
  const billType = String(formData.get("bill_type") ?? "gst") === "cash" ? "cash" : "gst";
  const allowOversell = String(formData.get("allow_oversell") ?? "") === "1";
  const sb = supabaseServer();
  let estPre: any = null;
  {
    const rich = await sb.from("estimates").select("status,order_id,sales_employee_id,customer_id,customer_name,customer_phone,buyer_gstin,buyer_address,merge_variants,extra_packing,extra_courier,extra_adjustment,price_tier").eq("id", id).maybeSingle();
    if (rich.error) {
      const basic = await sb.from("estimates").select("status,order_id,extra_packing,extra_courier,extra_adjustment,customer_name,customer_phone").eq("id", id).maybeSingle();
      estPre = basic.data;
    } else estPre = rich.data;
  }
  if (isBilledEstimate((estPre as any)?.status, (estPre as any)?.order_id)) {
    const existing = (estPre as any)?.order_id;
    if (existing) redirect(`/admin/invoice/${existing}`);
    redirect(`/admin/estimate/${id}?billerror=${encodeURIComponent("This estimate is already billed.")}`);
  }
  if (estPre && (estPre as any).status && (estPre as any).status !== "open") {
    redirect(`/admin/estimate/${id}?billerror=${encodeURIComponent("This estimate cannot be billed (re-open it first).")}`);
  }
  // Carry Sold By from the estimate. Optional form override (Employee B handling a quote Employee A wrote).
  // NULL is allowed so quotes created before Sold By existed still convert.
  const formEmp = String(formData.get("sales_employee_id") ?? "").trim();
  const salesEmployeeId = formEmp || ((estPre as any)?.sales_employee_id as string | undefined) || "";
  const { data, error } = await sb.rpc("convert_estimate_v2", { p_estimate_id: id, p_bill_type: billType, p_allow_oversell: allowOversell });
  // Insufficient-stock (or any) error: bounce back to the estimate with a clear message
  // instead of throwing a server error page.
  if (error) redirect(`/admin/estimate/${id}?billerror=${encodeURIComponent(error.message)}`);
  const orderId = (data as any)?.order_id;
  if (orderId) {
    const est = estPre as any;
    const xp = est?.extra_packing || 0, xc = est?.extra_courier || 0, xa = est?.extra_adjustment || 0;
    const gstin = String(formData.get("buyer_gstin") ?? est?.buyer_gstin ?? "").trim().toUpperCase() || null;
    const addr = String(formData.get("buyer_address") ?? est?.buyer_address ?? "").trim() || null;
    const buyerState = gstin && /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : null;
    let customerId = (est?.customer_id as string | null) ?? null;
    const ph = (est?.customer_phone as string | undefined)?.trim();
    const nm = (est?.customer_name as string | undefined)?.trim();
    if (!customerId && ph) {
      const { data: existing } = await sb.from("customers").select("id").eq("phone", ph).maybeSingle();
      if (existing) customerId = (existing as any).id;
      else {
        const { data: created } = await sb.from("customers")
          .insert({ name: nm || ph, phone: ph, gstin, address: addr, type: est?.price_tier === "wholesale" ? "wholesale" : "retail" })
          .select("id").maybeSingle();
        customerId = (created as any)?.id ?? null;
      }
    }
    const patch: Record<string, unknown> = {
      merge_variants: !!(est?.merge_variants || formData.get("merge_variants") === "1"),
      buyer_gstin: gstin,
      buyer_address: addr,
      buyer_state: buyerState,
      customer_id: customerId,
    };
    if (salesEmployeeId) patch.sales_employee_id = salesEmployeeId;
    if (xp !== 0 || xc !== 0 || xa !== 0) {
      const { data: oi } = await sb.from("order_items").select("line_total").eq("order_id", orderId);
      const itemsSum = ((oi as any[]) ?? []).reduce((s, r) => s + (r.line_total ?? 0), 0);
      patch.extra_packing = xp;
      patch.extra_courier = xc;
      patch.extra_adjustment = xa;
      patch.total = itemsSum + xp + xc + xa;
    }
    const { error: patchErr } = await sb.from("orders").update(patch).eq("id", orderId);
    if (patchErr) {
      console.warn("estimate→bill POS fields failed (retrying salesperson only):", patchErr.message);
      if (salesEmployeeId) {
        const { error: empErr } = await sb.from("orders").update({ sales_employee_id: salesEmployeeId }).eq("id", orderId);
        if (empErr) console.error("estimate→bill salesperson update ALSO failed:", empErr.message);
      }
    }
    // Belt-and-suspenders: mark the quote converted / cash_billed so it leaves the active list even
    // if an older convert_estimate_v2 (pre-0077) still stamps every bill as 'converted'.
    const nextStatus = estimateStatusAfterBill(billType);
    const { error: stErr } = await sb.from("estimates").update({ status: nextStatus, order_id: orderId }).eq("id", id);
    if (stErr) console.warn("estimate status after bill:", stErr.message);
    await sb.rpc("assign_invoice_no", { p_order: orderId });
  }
  revalidatePath("/admin/estimates"); revalidatePath("/admin/dashboard"); revalidatePath("/admin/sales");
  if (orderId) redirect(`/admin/invoice/${orderId}`);
  redirect("/admin/estimates");
}

/** Mark an estimate as denied (customer did not want the products). */
export async function denyEstimateAction(formData: FormData) {
  if (!(await requirePerm("estimates.deny"))) return;
  const id = String(formData.get("id"));
  const sb = supabaseServer();
  const { data: est } = await sb.from("estimates").select("status,order_id").eq("id", id).maybeSingle();
  if (!isOpenEstimate((est as any)?.status, (est as any)?.order_id)) return;
  await sb.from("estimates").update({ status: "denied" }).eq("id", id).eq("status", "open");
  revalidatePath("/admin/estimates");
}

/** Re-open a denied/expired estimate. Never re-open a billed quote (that would allow a second sale). */
export async function reopenEstimateAction(formData: FormData) {
  if (!(await requirePerm("estimates.create"))) return;
  const id = String(formData.get("id"));
  const sb = supabaseServer();
  const { data: est } = await sb.from("estimates").select("status,order_id").eq("id", id).maybeSingle();
  if (isBilledEstimate((est as any)?.status, (est as any)?.order_id)) return;
  const st = (est as any)?.status;
  if (st !== "denied" && st !== "expired") return;
  await sb.from("estimates").update({ status: "open" }).eq("id", id);
  revalidatePath("/admin/estimates");
}

/** Convert a backorder into a fulfilled sale once stock has arrived — clears the backorder flag so
 * it drops off the Backorders list and counts as a normal completed sale. */
export async function fulfillBackorderAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("billing.sell"))) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await supabaseServer().from("orders").update({ is_backorder: false }).eq("id", id);
  revalidatePath("/admin/backorders"); revalidatePath("/admin/sales"); revalidatePath("/admin/dashboard");
}

export async function recordReturnAction(input: { orderId: string; reason: string; items: { product_id: string; variantSku?: string; qty: number }[] }): Promise<{ ok: boolean; qty?: number; error?: string }> {
  if (!(await requirePerm("billing.refund"))) return { ok: false, error: "Your role can't process returns/refunds." };
  if (!input.items?.length) return { ok: false, error: "Select items to return" };
  if (!input.reason?.trim()) return { ok: false, error: "Capture a return reason" };
  // The RPC restocks by product_id; variantSku is carried for display/audit (variant-exact restock TBD).
  const p_items = input.items.map((i) => ({ product_id: i.product_id, qty: i.qty }));
  const { data, error } = await supabaseServer().rpc("record_sales_return", { p_order_id: input.orderId, p_reason: input.reason, p_items });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/returns"); revalidatePath("/admin/dashboard");
  return { ok: true, qty: (data as any)?.qty };
}

/** Cancel a whole bill (owner/refund permission): restocks every line net of returns,
 * reverses the sale + tender in the day-book, marks it cancelled. All downstream views
 * (Udhaar, cashbook, dashboard, revenue) already exclude cancelled bills (0045/0046). */
export async function cancelOrderAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("billing.refund"))) return;
  const id = String(formData.get("order_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "Cancelled";
  if (!id) return;
  const { error } = await supabaseServer().rpc("cancel_order", { p_order: id, p_reason: reason });
  if (error) { console.warn("cancel_order failed:", error.message); return; }
  revalidatePath(`/admin/invoice/${id}`); revalidatePath("/admin/sales"); revalidatePath("/admin/dashboard");
  revalidatePath("/admin/creditors"); revalidatePath("/admin/cashbook"); revalidatePath("/admin/inventory");
  revalidatePath("/admin/stock-movements"); revalidatePath("/admin/returns");
}