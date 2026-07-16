"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requirePerm } from "@/lib/auth";

/** Record a payment (advance / partial / settlement) against an order, in rupees. */
export async function recordPaymentAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("billing.sell"))) return;
  const orderId = String(formData.get("order_id") ?? "");
  const amount = Math.round((Number(formData.get("amount") ?? 0) || 0) * 100);
  const mode = ["cash", "bank", "upi"].includes(String(formData.get("mode"))) ? String(formData.get("mode")) : "cash";
  if (!orderId || !amount) return;
  const { error } = await supabaseServer().rpc("record_payment", { p_order: orderId, p_amount: amount, p_mode: mode });
  if (error) { console.error("record_payment failed:", error.message); return; }
  revalidatePath(`/admin/invoice/${orderId}`); revalidatePath("/admin/sales"); revalidatePath("/admin/dashboard"); revalidatePath("/admin/cashbook");
}

/** Udhaar: receive a lump payment from a PARTY (customer), allocated across their open
 *  bills oldest-first by the record_party_payment RPC (migration 0043). Amount in rupees.
 *  Any surplus is kept as an advance on the customer's account. */
export async function recordPartyPaymentAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("billing.sell"))) return;
  const customerId = String(formData.get("customer_id") ?? "");
  const amount = Math.round((Number(formData.get("amount") ?? 0) || 0) * 100);
  const mode = ["cash", "bank", "upi"].includes(String(formData.get("mode"))) ? String(formData.get("mode")) : "cash";
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!customerId || !amount) return;
  const { error } = await supabaseServer().rpc("record_party_payment", { p_customer: customerId, p_amount: amount, p_mode: mode, p_note: note });
  if (error) { console.error("record_party_payment failed:", error.message); return; }
  revalidatePath("/admin/creditors"); revalidatePath("/admin/customers"); revalidatePath(`/admin/customer/${customerId}`);
  revalidatePath("/admin/sales"); revalidatePath("/admin/dashboard"); revalidatePath("/admin/cashbook");
}

/** Pillar 9: set the opening cash-in-hand and bank balances for the cash book (₹ → paise). */
export async function setCashBankOpeningAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("analytics.view"))) return;
  const cash = Math.max(0, Math.round((Number(formData.get("opening_cash") ?? 0) || 0) * 100));
  const bank = Math.max(0, Math.round((Number(formData.get("opening_bank") ?? 0) || 0) * 100));
  await supabaseServer().from("doc_settings").update({ opening_cash: cash, opening_bank: bank }).eq("id", 1);
  revalidatePath("/admin/cashbook");
}

/** Save an internal note on an order (#5/#34) — admin reference only, never printed. */
export async function saveOrderNoteAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("billing.sell"))) return;
  const orderId = String(formData.get("order_id") ?? "");
  const note = String(formData.get("admin_note") ?? "").trim() || null;
  if (!orderId) return;
  await supabaseServer().from("orders").update({ admin_note: note }).eq("id", orderId);
  revalidatePath(`/admin/invoice/${orderId}`);
}

/** Convert a bill between Cash Memo and GST Tax Invoice (both ways) — customers change
 *  their mind mid-billing. Assigns an invoice number when becoming a GST invoice. */
export async function setBillTypeAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("billing.gst"))) return;
  const orderId = String(formData.get("order_id") ?? "");
  const billType = String(formData.get("bill_type") ?? "") === "gst" ? "gst" : "cash";
  if (!orderId) return;
  const sb = supabaseServer();
  await sb.from("orders").update({ bill_type: billType }).eq("id", orderId);
  if (billType === "gst") {
    const { data: o } = await sb.from("orders").select("invoice_no").eq("id", orderId).maybeSingle();
    if (!(o as any)?.invoice_no) await sb.rpc("assign_invoice_no", { p_order: orderId });
  }
  revalidatePath(`/admin/invoice/${orderId}`); revalidatePath("/admin/sales");
}

/** Switch a bill between Proforma and final Tax Invoice. */
export async function setDocTypeAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("billing.gst"))) return;
  const orderId = String(formData.get("order_id") ?? "");
  const docType = String(formData.get("doc_type") ?? "") === "proforma" ? "proforma" : "invoice";
  if (!orderId) return;
  const sb = supabaseServer();
  await sb.from("orders").update({ doc_type: docType }).eq("id", orderId);
  // Assign a real invoice number when finalising a tax invoice.
  if (docType === "invoice") await sb.rpc("assign_invoice_no", { p_order: orderId });
  revalidatePath(`/admin/invoice/${orderId}`);
}

/** Pillar 3 — choose how GST is shown on a tax invoice:
 *   'exclusive' → rate is pre-tax, GST added on top (taxable + GST = grand total)
 *   'inclusive' → rate already includes GST (back-computed from the stored total)
 *   'auto'      → clear the override; fall back to the channel default
 *                 (wholesale = exclusive, retail/pos = inclusive). */
export async function setGstModeAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("billing.gst"))) return;
  const orderId = String(formData.get("order_id") ?? "");
  const raw = String(formData.get("gst_mode") ?? "");
  const gst_mode = raw === "exclusive" ? "exclusive" : raw === "inclusive" ? "inclusive" : null;
  if (!orderId) return;
  await supabaseServer().from("orders").update({ gst_mode }).eq("id", orderId);
  revalidatePath(`/admin/invoice/${orderId}`);
}

/** Refund excess money on an over-collected bill (post-return / over-tender). The
 *  record_refund RPC (0051) clamps to the true refundable excess, reverses the right
 *  tender bucket, posts the day-book debit and audit-logs it. Amount in rupees. */
export async function recordRefundAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("billing.refund"))) return;
  const orderId = String(formData.get("order_id") ?? "");
  const amount = Math.round((Number(formData.get("amount") ?? 0) || 0) * 100);
  const mode = String(formData.get("mode")) === "bank" ? "bank" : "cash";
  if (!orderId || !amount) return;
  const { error } = await supabaseServer().rpc("record_refund", { p_order: orderId, p_amount: amount, p_mode: mode });
  if (error) { console.warn("record_refund failed:", error.message); return; }
  revalidatePath(`/admin/invoice/${orderId}`); revalidatePath("/admin/sales"); revalidatePath("/admin/dashboard");
  revalidatePath("/admin/cashbook"); revalidatePath("/admin/creditors");
}