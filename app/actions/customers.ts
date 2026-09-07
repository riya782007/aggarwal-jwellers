"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { requirePerm } from "@/lib/auth";

export async function upsertCustomerAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("customers.manage"))) return;
  const id = String(formData.get("id") ?? "").trim();
  const isQuickAdd = !id;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const creditRupees = Number(formData.get("credit_balance") ?? 0) || 0;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const row = {
    name,
    phone,
    email: String(formData.get("email") ?? "").trim() || null,
    type: String(formData.get("type") ?? "retail") === "wholesale" ? "wholesale" : "retail",
    gstin: String(formData.get("gstin") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    city: String(formData.get("city") ?? "").trim() || null,
    credit_balance: Math.round(creditRupees * 100),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
  const sb = supabaseServer();

  // De-duplication: when creating a NEW customer (no id given), match an existing record
  // by phone first (strongest signal), falling back to a case-insensitive exact name match.
  // This stops "Priya" entered twice (or with different casing/whitespace) from splitting
  // one customer's order history across two rows.
  let targetId = id;
  if (!targetId) {
    let existing: { id: string } | null = null;
    if (phone) {
      const { data } = await sb.from("customers").select("id").eq("phone", phone).maybeSingle();
      existing = (data as any) ?? null;
    }
    if (!existing && name) {
      const { data } = await sb.from("customers").select("id").ilike("name", name).maybeSingle();
      existing = (data as any) ?? null;
    }
    if (existing) targetId = existing.id;
  }

  const { error } = targetId
    ? await sb.from("customers").update(row).eq("id", targetId)
    : await sb.from("customers").insert(row);
  if (error) redirect(`/admin/customers?err=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/customers");
  if (targetId) revalidatePath(`/admin/customer/${targetId}`);
  // Return to a fresh form with a clear confirmation after an add, including a de-duplicated add.
  if (isQuickAdd) redirect("/admin/customers?msg=Customer+saved");
}

export async function deleteCustomerAction(formData: FormData) {
  if (!(await requirePerm("customers.manage"))) return;
  const id = String(formData.get("id"));
  if (!id) return;
  // Customer FKs (orders / party_payments / quote_requests) are all ON DELETE SET NULL, so the delete
  // succeeds and those rows simply detach — and every bill keeps its own name/phone snapshot, so no
  // sales history is lost. We still surface any unexpected error rather than failing silently.
  const { error } = await supabaseServer().from("customers").delete().eq("id", id);
  revalidatePath("/admin/customers");
  if (error) redirect(`/admin/customers?err=${encodeURIComponent(error.message)}`);
  redirect("/admin/customers?msg=Customer+deleted");
}
