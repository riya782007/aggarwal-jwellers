"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { requirePerm } from "@/lib/auth";

/** Pillar 13: set the opening balance we owed this supplier when tracking began (₹ → paise). */
export async function setSupplierOpeningBalanceAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("suppliers.manage"))) return;
  const id = String(formData.get("id") ?? "");
  const rupees = Number(formData.get("opening") ?? 0);
  if (!id || !Number.isFinite(rupees) || rupees < 0) return;
  await supabaseServer().from("suppliers").update({ opening_balance: Math.round(rupees * 100) }).eq("id", id);
  revalidatePath(`/admin/supplier/${id}`);
}

/** Pillar 14: record a payment made TO a supplier (reduces what we owe). */
export async function recordSupplierPaymentAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("suppliers.manage"))) return;
  const id = String(formData.get("id") ?? "");
  const rupees = Number(formData.get("amount") ?? 0);
  const mode = ["cash", "bank", "upi"].includes(String(formData.get("mode"))) ? String(formData.get("mode")) : "cash";
  const ref = String(formData.get("ref") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!id || !Number.isFinite(rupees) || rupees <= 0) return;
  await supabaseServer().from("supplier_payments").insert({ supplier_id: id, amount: Math.round(rupees * 100), mode, ref, note });
  revalidatePath(`/admin/supplier/${id}`);
}

/** Delete a supplier payment (correction). */
export async function deleteSupplierPaymentAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("suppliers.manage"))) return;
  const id = String(formData.get("id") ?? "");
  const supplierId = String(formData.get("supplier_id") ?? "");
  if (!id) return;
  await supabaseServer().from("supplier_payments").delete().eq("id", id);
  revalidatePath(`/admin/supplier/${supplierId}`);
}

export async function upsertSupplierAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("suppliers.manage"))) return;
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
  // Log failures loudly. If the full row is rejected (e.g. a column from migration 0057 isn't
  // applied yet), retry with the always-present core fields so a supplier can still be saved.
  const { error } = id
    ? await sb.from("suppliers").update(row).eq("id", id)
    : await sb.from("suppliers").insert(row);
  if (error) {
    console.warn("upsertSupplier full row failed (retrying core fields — apply migration 0057):", error.message);
    const core = { name, city: row.city };
    const { error: coreErr } = id
      ? await sb.from("suppliers").update(core).eq("id", id)
      : await sb.from("suppliers").insert(core);
    if (coreErr) console.error("upsertSupplier core insert ALSO failed:", coreErr.message);
  }
  revalidatePath("/admin/suppliers"); revalidatePath("/admin/purchases");
}

export async function deleteSupplierAction(formData: FormData) {
  if (!(await requirePerm("suppliers.manage"))) return;
  const id = String(formData.get("id"));
  if (!id) return;
  const sb = supabaseServer();
  // A supplier with purchase history CAN'T be hard-deleted — the purchases FK is NO ACTION, and those
  // bills moved stock and posted to the ledger. Previously the DB rejected the delete and the error
  // was swallowed, so the button did nothing. Now: block with a clear reason instead of silence.
  const { count } = await sb.from("purchases").select("id", { count: "exact", head: true }).eq("supplier_id", id);
  if ((count ?? 0) > 0) {
    redirect(`/admin/suppliers?err=${encodeURIComponent(`Can't delete this supplier — it has ${count} purchase bill${count === 1 ? "" : "s"} linked (those bills moved stock and money). Cancel or reassign those purchases first.`)}`);
  }
  const { error } = await sb.from("suppliers").delete().eq("id", id);
  revalidatePath("/admin/suppliers");
  if (error) redirect(`/admin/suppliers?err=${encodeURIComponent(error.message)}`);
}
