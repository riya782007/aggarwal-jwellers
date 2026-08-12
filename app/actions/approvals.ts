"use server";
/** OTP approval decision (Req 8.3-8.4). Wrong/empty OTP keeps it pending; correct OTP applies. */
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requirePerm } from "@/lib/auth";

const hashOtp = (otp: string) => `h:${otp}`; // legacy per-row check (kept for backward compatibility)
// The authoritative owner OTP is the deployment secret. Verify against the CURRENT value so the code
// you set in Vercel always works — even for requests raised before it was changed. Falls back to the
// old public default only if the env var is unset (which should be fixed in prod).
const OWNER_OTP = () => (process.env.OWNER_OTP ?? "482913").trim();

export async function decideApprovalAction(formData: FormData) {
  if (!(await requirePerm("approvals.approve"))) return; // only an OTP-approver may decide
  const id = String(formData.get("id"));
  const otp = String(formData.get("otp") ?? "").trim();
  const approve = String(formData.get("approve")) === "1";
  const sb = supabaseServer();

  const { data: a } = await sb.from("approvals").select("*").eq("id", id).maybeSingle();
  if (!a || a.status !== "pending") return;

  // Accept the current owner OTP (Vercel env) OR the value frozen into the row at creation (legacy).
  const otpOk = otp.length > 0 && (otp === OWNER_OTP() || hashOtp(otp) === a.otp_hash);
  if (!otpOk) {
    await sb.from("audit_log").insert({ actor: "owner", action: "otp_rejected", ref: id, detail: "invalid OTP" });
    revalidatePath("/admin/approvals");
    return; // stays pending, no effect
  }

  const status = approve ? "approved" : "rejected";
  const { error: updErr } = await sb.from("approvals").update({ status, decided_at: new Date().toISOString() }).eq("id", id);
  if (updErr) { console.error("approval decision update failed:", updErr.message); return; } // don't apply if we couldn't record the decision
  await sb.from("audit_log").insert({ actor: "owner", action: status, ref: id, detail: "OTP verified" });

  // Apply the change on approval.
  if (approve && a.action === "edit_price") {
    await sb.from("audit_log").insert({ actor: "system", action: "applied", ref: id, detail: `price change applied: ${JSON.stringify(a.payload)}` });
  }
  if (approve && a.action === "delete_purchase") {
    const pid = (a.payload as any)?.purchase_id;
    if (pid) {
      await sb.rpc("delete_purchase", { p_id: pid });
      await sb.from("audit_log").insert({ actor: "system", action: "applied", ref: id, detail: `purchase ${pid} deleted & stock reversed` });
      revalidatePath("/admin/purchases");
    }
  }
  revalidatePath("/admin/approvals");
  revalidatePath("/admin/dashboard");
}
