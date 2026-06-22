"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export async function upsertSupplierAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const row = {
    name,
    kind: String(formData.get("kind") ?? "supplier"),
    city: String(formData.get("city") ?? "").trim() || null,
    state: String(formData.get("state") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    gstin: String(formData.get("gstin") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
  const sb = supabaseServer();
  if (id) await sb.from("suppliers").update(row).eq("id", id);
  else await sb.from("suppliers").insert(row);
  revalidatePath("/admin/suppliers"); revalidatePath("/admin/purchases");
}

export async function deleteSupplierAction(formData: FormData) {
  const id = String(formData.get("id"));
  await supabaseServer().from("suppliers").delete().eq("id", id);
  revalidatePath("/admin/suppliers");
}
