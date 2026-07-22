"use server";
/**
 * Website-order fulfillment (0047): accept / reject / dispatch / deliver.
 * Integrity notes:
 *  • Reject rides on cancel_order (0046) — stock back, day-book + tender reversed, dead
 *    status excluded from revenue/Udhaar/cashbook automatically (0045 formula).
 *  • Deliver on a COD bill records the cash collected at the door via record_payment
 *    (clamped to the true GST-aware due), so the cash book and Udhaar settle themselves.
 *  • WhatsApp pings are best-effort and never block the workflow.
 */
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requirePerm } from "@/lib/auth";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { orderDuePaise } from "@/lib/business";
import { formatPaise } from "@/lib/pricing";

function revalidateOrderSurfaces(id: string) {
  revalidatePath("/admin/orders"); revalidatePath("/admin/sales"); revalidatePath("/admin/dashboard");
  revalidatePath(`/admin/invoice/${id}`); revalidatePath("/admin/creditors"); revalidatePath("/admin/cashbook");
}

/**
 * Wholesale QR payment gate (0059). A dealer pays by scanning the shop UPI QR — there is no
 * Razorpay webhook to confirm it, so the OWNER personally confirms the money landed. Only this
 * confirmation opens the accept → dispatch chain. It also records the receipt in full via the
 * same GST-aware record_payment RPC that COD-on-delivery uses, so the books & Udhaar settle.
 */
export async function confirmWholesalePaymentAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("billing.sell"))) return;
  const id = String(formData.get("order_id") ?? "");
  if (!id) return;
  const sb = supabaseServer();
  const { data: o } = await sb.from("orders")
    .select("id,status,channel,total,bill_type,gst_mode,return_amount,amount_paid,payment_confirmed_at,customer_name,customer_phone")
    .eq("id", id).maybeSingle();
  if (!o || ["cancelled", "void", "refunded"].includes((o as any).status)) return;
  if ((o as any).payment_confirmed_at) return; // already confirmed — never double-record
  // COMMIT the order now that the money is in (0060): this is where stock is finally decremented
  // and the sale is booked to the ledger — nothing was moved at placement. Idempotent, and oversell
  // is allowed because payment has already been received, so it must never fail on a stock dip.
  {
    const { error: commitErr } = await sb.rpc("commit_wholesale_order", { p_order: id });
    if (commitErr) { console.warn("wholesale commit failed:", commitErr.message); return; }
  }
  // Assign the GST invoice number now (the order is a real, paid sale from this moment).
  await sb.rpc("assign_invoice_no", { p_order: id }).then(() => {}, () => {});
  // Mark fully paid: record the true GST-aware outstanding as a UPI receipt (idempotent-safe —
  // if somehow already paid, due is 0 and record_payment is skipped).
  const due = orderDuePaise(o as any);
  if (due > 0) {
    const { error } = await sb.rpc("record_payment", { p_order: id, p_amount: due, p_mode: "upi" });
    if (error) { console.warn("wholesale payment receipt not recorded:", error.message); return; }
  }
  await sb.from("orders").update({
    payment_confirmed_at: new Date().toISOString(),
    payment_confirmed_by: "owner",
  }).eq("id", id);
  await sb.from("audit_log").insert({ actor: "owner", action: "wholesale_payment_confirmed", ref: id, detail: `UPI payment confirmed for wholesale order ${String(id).slice(0, 8).toUpperCase()}.` }).then(() => {}, () => {});
  await sendWhatsAppText((o as any).customer_phone,
    `Namaste ${(o as any).customer_name ?? ""}! We've received your payment for Aggarwal Jewellers order ${String(id).slice(0, 8).toUpperCase()} — it's now being prepared. 🙏`).catch(() => {});
  revalidateOrderSurfaces(id);
}

export async function acceptOrderAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("billing.sell"))) return;
  const id = String(formData.get("order_id") ?? "");
  if (!id) return;
  const sb = supabaseServer();
  const { data: o } = await sb.from("orders").select("id,status,channel,payment_confirmed_at,customer_name,customer_phone,total").eq("id", id).maybeSingle();
  if (!o || ["cancelled", "void", "refunded"].includes((o as any).status)) return;
  // Gate: a wholesale order cannot be accepted until its QR payment has been confirmed (0059).
  if ((o as any).channel === "wholesale" && !(o as any).payment_confirmed_at) return;
  await sb.from("orders").update({ fulfillment: "accepted" }).eq("id", id);
  await sendWhatsAppText((o as any).customer_phone,
    `Namaste ${(o as any).customer_name ?? ""}! Your Aggarwal Jewellers order ${String(id).slice(0, 8).toUpperCase()} is confirmed and being prepared. Track: /track`).catch(() => {});
  revalidateOrderSurfaces(id);
}

export async function rejectOrderAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("billing.refund"))) return;
  const id = String(formData.get("order_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "Order rejected";
  if (!id) return;
  const sb = supabaseServer();
  const { data: o } = await sb.from("orders").select("customer_name,customer_phone,channel,payment_confirmed_at").eq("id", id).maybeSingle();
  // 0060 — an uncommitted wholesale order (placed, awaiting UPI payment) never moved stock or booked
  // revenue, so it must NOT go through cancel_order (that would RESTORE stock never taken and post a
  // phantom reversal). We confirm "nothing was committed" by checking for actual stock movements,
  // which also correctly handles legacy pre-0060 orders that DID move stock at placement.
  let uncommitted = false;
  if ((o as any)?.channel === "wholesale" && !(o as any)?.payment_confirmed_at) {
    const { data: adj } = await sb.from("stock_adjustments").select("id").eq("source", `wholesale order ${id}`).limit(1);
    uncommitted = !adj || (adj as any[]).length === 0;
  }
  if (uncommitted) {
    await sb.from("orders").update({ status: "cancelled", fulfillment: "rejected" }).eq("id", id);
    await sendWhatsAppText((o as any)?.customer_phone,
      `Namaste ${(o as any)?.customer_name ?? ""}, your Aggarwal Jewellers order ${String(id).slice(0, 8).toUpperCase()} was cancelled as payment wasn't received. Do reach out if you'd still like to order.`).catch(() => {});
    revalidateOrderSurfaces(id);
    return;
  }
  const { error } = await sb.rpc("cancel_order", { p_order: id, p_reason: reason });
  if (error) { console.warn("reject/cancel failed:", error.message); return; }
  await sb.from("orders").update({ fulfillment: "rejected" }).eq("id", id);
  await sendWhatsAppText((o as any)?.customer_phone,
    `Namaste ${(o as any)?.customer_name ?? ""}, we're sorry — your Aggarwal Jewellers order ${String(id).slice(0, 8).toUpperCase()} could not be fulfilled and has been cancelled. Any payment will be refunded.`).catch(() => {});
  revalidateOrderSurfaces(id); revalidatePath("/admin/inventory"); revalidatePath("/admin/stock-movements");
}

export async function dispatchOrderAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("billing.sell"))) return;
  const id = String(formData.get("order_id") ?? "");
  if (!id) return;
  const sb = supabaseServer();
  const { data: o } = await sb.from("orders").select("id,status,customer_name,customer_phone").eq("id", id).maybeSingle();
  if (!o || ["cancelled", "void", "refunded"].includes((o as any).status)) return;
  await sb.from("orders").update({ status: "dispatched", dispatched_at: new Date().toISOString(), fulfillment: "accepted" }).eq("id", id);
  await sendWhatsAppText((o as any).customer_phone,
    `📦 Your Aggarwal Jewellers order ${String(id).slice(0, 8).toUpperCase()} is on its way!`).catch(() => {});
  revalidateOrderSurfaces(id);
}

export async function deliverOrderAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("billing.sell"))) return;
  const id = String(formData.get("order_id") ?? "");
  if (!id) return;
  const sb = supabaseServer();
  const { data: o } = await sb.from("orders")
    .select("id,status,payment_mode,total,bill_type,gst_mode,return_amount,amount_paid,customer_name,customer_phone")
    .eq("id", id).maybeSingle();
  if (!o || ["cancelled", "void", "refunded"].includes((o as any).status)) return;
  // COD: the courier hands over cash at the door — record it so the cash book & Udhaar settle.
  const due = orderDuePaise(o as any);
  if ((o as any).payment_mode === "cod" && due > 0) {
    const { error } = await sb.rpc("record_payment", { p_order: id, p_amount: due, p_mode: "cash" });
    if (error) console.warn("COD collection not recorded:", error.message);
  }
  await sb.from("orders").update({ status: "delivered", delivered_at: new Date().toISOString(), fulfillment: "accepted" }).eq("id", id);
  await sendWhatsAppText((o as any).customer_phone,
    `✅ Delivered! Your Aggarwal Jewellers order ${String(id).slice(0, 8).toUpperCase()}${due > 0 ? ` (${formatPaise(due)} collected)` : ""}. Thank you — we'd love a review!`).catch(() => {});
  revalidateOrderSurfaces(id);
}
