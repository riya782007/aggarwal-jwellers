"use server";
/** Quote requests (RFQ): trade portal → owner inbox at /admin/quotes. */
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requirePerm } from "@/lib/auth";
import { getWholesaleSession } from "@/lib/wholesale";

export async function createQuoteRequestAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const items = String(formData.get("items") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  const nameIn = String(formData.get("name") ?? "").trim();
  const phoneIn = String(formData.get("phone") ?? "").replace(/\D/g, "").slice(-10);
  if (!items) return { ok: false, message: "Tell us what you need — designs/SKUs and quantities." };
  const sess = await getWholesaleSession().catch(() => null);
  const name = (sess as any)?.name ?? nameIn;
  const phone = (sess as any)?.phone ?? phoneIn;
  if (!name || !phone) return { ok: false, message: "Name and phone are required." };
  await supabaseServer().from("quote_requests").insert({ customer_id: (sess as any)?.id ?? null, name, phone, items, note });
  revalidatePath("/admin/quotes");
  return { ok: true, message: "Quote request sent! We'll come back with rates on WhatsApp shortly." };
}

export async function setQuoteStatusAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("sales.view"))) return;
  const id = String(formData.get("id") ?? "");
  const status = ["new", "quoted", "closed"].includes(String(formData.get("status"))) ? String(formData.get("status")) : "new";
  const quote_note = String(formData.get("quote_note") ?? "").trim() || null;
  if (!id) return;
  await supabaseServer().from("quote_requests").update({ status, ...(quote_note ? { quote_note } : {}) }).eq("id", id);
  revalidatePath("/admin/quotes");
}
