"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { authoritativePerms, requirePerm } from "@/lib/auth";

/** Add or edit an employee (salesperson). Gated to customer/staff managers. */
export async function upsertEmployeeAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("customers.manage"))) return;
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const row = {
    name,
    phone: String(formData.get("phone") ?? "").trim() || null,
    title: String(formData.get("title") ?? "").trim() || null,
    active: String(formData.get("active") ?? "on") !== "off",
  };
  const sb = supabaseServer();
  if (id) await sb.from("employees").update(row).eq("id", id);
  else await sb.from("employees").insert(row);
  revalidatePath("/admin/employees");
}

/**
 * Quick-add (or reuse) a salesperson straight from the POS "Sold by" box, so a counter staffer who
 * isn't in the roster yet can record their name and get their sales tracked without leaving billing.
 * Matches an existing employee by name (case-insensitive) to avoid duplicates; re-activates if needed.
 * Gated on the same permission as ringing up a sale.
 */
export async function quickAddEmployeeAction(name: string): Promise<{ ok: boolean; id?: string; name?: string; error?: string }> {
  const perms = await authoritativePerms();
  const canAdd = perms === "*" || perms.includes("billing.sell") || perms.includes("estimates.create");
  if (!canAdd) return { ok: false, error: "not permitted" };
  const n = (name ?? "").trim();
  if (!n) return { ok: false, error: "Enter a name" };
  const sb = supabaseServer();
  const { data: existing } = await sb.from("employees").select("id,name,active").ilike("name", n).limit(1);
  const hit = (existing as any[])?.[0];
  if (hit) {
    if (!hit.active) await sb.from("employees").update({ active: true }).eq("id", hit.id);
    revalidatePath("/admin/employees");
    return { ok: true, id: hit.id, name: hit.name };
  }
  const { data, error } = await sb.from("employees").insert({ name: n, active: true }).select("id,name").maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not add" };
  revalidatePath("/admin/employees");
  return { ok: true, id: (data as any).id, name: (data as any).name };
}

/** Toggle an employee active/inactive (kept, not deleted, so their past sales stay attributed). */
export async function setEmployeeActiveAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("customers.manage"))) return;
  const id = String(formData.get("id") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return;
  await supabaseServer().from("employees").update({ active }).eq("id", id);
  revalidatePath("/admin/employees");
}

/**
 * Remove an employee — history-safe. orders.sales_employee_id is ON DELETE SET NULL, so hard-deleting
 * someone who has bills would erase their attribution on every past bill. So: if they have ANY bills,
 * we keep the row and mark it removed (deleted_at) — it drops off the roster and the POS "Sold by"
 * picker, but past sales still show their name. Only a staffer with zero bills is truly hard-deleted.
 */
export async function deleteEmployeeAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("customers.manage"))) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const sb = supabaseServer();
  const { count } = await sb.from("orders").select("id", { count: "exact", head: true }).eq("sales_employee_id", id);
  if ((count ?? 0) > 0) {
    await sb.from("employees").update({ deleted_at: new Date().toISOString(), active: false }).eq("id", id);
    revalidatePath("/admin/employees");
    redirect(`/admin/employees?msg=${encodeURIComponent(`Removed — kept on record for the ${count} past bill${count === 1 ? "" : "s"} they handled, so history stays intact.`)}`);
  }
  await sb.from("employees").delete().eq("id", id);
  revalidatePath("/admin/employees");
  redirect(`/admin/employees?msg=${encodeURIComponent("Employee deleted.")}`);
}
