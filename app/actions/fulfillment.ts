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

export async function acceptOrderAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("billing.sell"))) return;
  const id = String(formData.get("order_id") ?? "");
  if (!id) return;
  const sb = supabaseServer();
  const { data: o } = await sb.from("orders").select("id,status,customer_name,customer_phone,total").eq("id", id).maybeSingle();
  if (!o || ["cancelled", "void", "refunded"].includes((o as any).status)) return;
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
  const { error } = await sb.rpc("cancel_order", { p_order: id, p_reason: reason });
  if (error) { console.warn("reject/cancel failed:", error.message); return; }
  const { data: o } = await sb.from("orders").select("customer_name,customer_phone").eq("id", id).maybeSingle();
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
