"use server";
/** Dealer self-signup (trade portal): application + business proof upload lands as a PENDING
 *  wholesale customer. The owner approves from the customer page (existing flow) which issues
 *  the trade access code — nothing is auto-granted. */
import { supabaseServer } from "@/lib/supabase/server";

const PROOF_BUCKET = "dealer-proofs";

export async function applyDealerAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").replace(/\D/g, "").slice(-10);
  const city = String(formData.get("city") ?? "").trim() || null;
  const gstin = String(formData.get("gstin") ?? "").trim().toUpperCase() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const proof = formData.get("proof") as File | null;
  if (!name || phone.length !== 10) return { ok: false, message: "Name and a 10-digit phone are required." };
  if (!proof || typeof proof !== "object" || proof.size === 0) return { ok: false, message: "Business proof is required — a shop photo, GST certificate, Instagram page or website screenshot." };
  if (proof.size > 8 * 1024 * 1024) return { ok: false, message: "Proof file is too big — keep it under 8 MB." };

  const sb = supabaseServer();
  await sb.storage.createBucket(PROOF_BUCKET, { public: true }).then(() => {}, () => {});
  const ext = ((proof.type.split("/")[1]) || "jpg").replace("jpeg", "jpg");
  const path = `${phone}-${Date.now()}.${ext}`;
  const up = await sb.storage.from(PROOF_BUCKET).upload(path, new Uint8Array(await proof.arrayBuffer()), { contentType: proof.type || "image/jpeg", upsert: true });
  if (up.error) return { ok: false, message: "Couldn't upload the proof — try a smaller image." };
  const { data: pub } = sb.storage.from(PROOF_BUCKET).getPublicUrl(path);
  const proofUrl = pub.publicUrl;

  // De-dupe by phone: an existing customer becomes a pending wholesale applicant; else create one.
  const { data: existing } = await sb.from("customers").select("id,type,wholesale_approved").eq("phone", phone).maybeSingle();
  if (existing) {
    if ((existing as any).type === "wholesale" && (existing as any).wholesale_approved) {
      return { ok: false, message: "This phone already has an approved dealer account — sign in above." };
    }
    await sb.from("customers").update({ name, type: "wholesale", wholesale_approved: false, city, gstin, business_proof_url: proofUrl, signup_note: note }).eq("id", (existing as any).id);
  } else {
    await sb.from("customers").insert({ name, phone, type: "wholesale", wholesale_approved: false, city, gstin, business_proof_url: proofUrl, signup_note: note });
  }
  await sb.from("audit_log").insert({ actor: "public", action: "dealer_application", ref: phone, detail: `${name}${city ? " · " + city : ""} applied for a dealer account.` });
  return { ok: true, message: "Application received! We verify every dealer personally — you'll get your access code on WhatsApp once approved." };
}
