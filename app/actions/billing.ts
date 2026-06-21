"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export async function createEstimateAction(input: { items: { sku: string; qty: number }[]; customer: { name?: string } }): Promise<{ ok: boolean; estimateId?: string; total?: number; error?: string }> {
  if (!input.items?.length) return { ok: false, error: "Add at least one item" };
  const { data, error } = await supabaseServer().rpc("create_estimate", { p_items: input.items, p_customer: input.customer ?? {} });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/estimates");
  return { ok: true, estimateId: (data as any)?.estimate_id, total: (data as any)?.total };
}

export async function convertEstimateAction(formData: FormData) {
  const id = String(formData.get("id"));
  await supabaseServer().rpc("convert_estimate", { p_estimate_id: id });
  revalidatePath("/admin/estimates"); revalidatePath("/admin/dashboard");
}

export async function recordReturnAction(input: { orderId: string; reason: string; items: { product_id: string; qty: number }[] }): Promise<{ ok: boolean; qty?: number; error?: string }> {
  if (!input.items?.length) return { ok: false, error: "Select items to return" };
  if (!input.reason?.trim()) return { ok: false, error: "Capture a return reason" };
  const { data, error } = await supabaseServer().rpc("record_sales_return", { p_order_id: input.orderId, p_reason: input.reason, p_items: input.items });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/returns"); revalidatePath("/admin/dashboard");
  return { ok: true, qty: (data as any)?.qty };
}
