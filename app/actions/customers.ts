"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { requirePerm } from "@/lib/auth";

export async function upsertCustomerAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("customers.manage"))) return;
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const creditRupees = Number(formData.get("credit_balance") ?? 0) || 0;
  const row = {
    name,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    type: String(formData.get("type") ?? "retail") === "wholesale" ? "wholesale" : "retail",
    gstin: String(formData.get("gstin") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    city: String(formData.get("city") ?? "").trim() || null,
    credit_balance: Math.round(creditRupees * 100),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
  const sb = supabaseServer();
  if (id) await sb.from("customers").update(row).eq("id", id);
  else await sb.from("customers").insert(row);
  revalidatePath("/admin/customers");
  if (id) revalidatePath(`/admin/customer/${id}`);
}

export async function deleteCustomerAction(formData: FormData) {
  if (!(await requirePerm("customers.manage"))) return;
  const id = String(formData.get("id"));
  await supabaseServer().from("customers").delete().eq("id", id);
  revalidatePath("/admin/customers");
  redirect("/admin/customers");
}
