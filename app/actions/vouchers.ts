"use server";
/** Voucher admin CRUD (marketing.manage) + the public checkout preview check.
 *  Validation/redemption logic lives in lib/vouchers.ts — single source of truth. */
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requirePerm } from "@/lib/auth";
import { validateVoucher, type VoucherCheck } from "@/lib/vouchers";

export async function createVoucherAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("marketing.manage"))) return;
  const code = String(formData.get("code") ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const kind = String(formData.get("kind")) === "flat" ? "flat" : "percent";
  const valueNum = Math.max(0, Math.round(Number(formData.get("value")) || 0));
  const value = kind === "flat" ? valueNum * 100 : Math.min(90, valueNum); // flat entered in ₹
  const min_order = Math.max(0, Math.round(Number(formData.get("min_order")) || 0)) * 100;
  const capR = Math.round(Number(formData.get("cap")) || 0);
  const cap = kind === "percent" && capR > 0 ? capR * 100 : null;
  const channel = ["retail", "wholesale", "all"].includes(String(formData.get("channel"))) ? String(formData.get("channel")) : "retail";
  const usage = Math.round(Number(formData.get("usage_limit")) || 0);
  const starts = String(formData.get("starts_at") ?? "").trim();
  const ends = String(formData.get("ends_at") ?? "").trim();
  if (!code || value <= 0) return;
  await supabaseServer().from("vouchers").insert({
    code, kind, value, min_order, cap, channel,
    usage_limit: usage > 0 ? usage : null,
    starts_at: starts ? new Date(starts + "T00:00:00+05:30").toISOString() : null,
    ends_at: ends ? new Date(ends + "T23:59:59+05:30").toISOString() : null,
  });
  revalidatePath("/admin/vouchers");
}

export async function toggleVoucherAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("marketing.manage"))) return;
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active")) === "1";
  if (!id) return;
  await supabaseServer().from("vouchers").update({ active }).eq("id", id);
  revalidatePath("/admin/vouchers");
}

export async function deleteVoucherAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("marketing.manage"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await supabaseServer().from("vouchers").delete().eq("id", id);
  revalidatePath("/admin/vouchers");
}

/** Public: preview a code against the current bag (retail checkout). Read-only. */
export async function checkVoucherAction(code: string, itemsPaise: number): Promise<VoucherCheck> {
  return validateVoucher(code, Math.max(0, Math.round(itemsPaise)), "retail");
}
