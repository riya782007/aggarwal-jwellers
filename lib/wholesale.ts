import "server-only";
import { cookies } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { supabaseServer } from "@/lib/supabase/server";

/** Returns the logged-in wholesale customer, or null. Any wholesale account (self-registered or
 *  owner-approved) counts — ordering is open to account holders; the ₹-minimum is the gate. */
export async function getWholesaleSession(): Promise<{ id: string; name: string; phone: string } | null> {
  const id = cookies().get("bd_wholesale")?.value;
  if (!id) return null;
  const { data } = await supabaseServer()
    .from("customers").select("id,name,phone,type").eq("id", id).maybeSingle();
  const c = data as any;
  if (!c || c.type !== "wholesale") return null;
  // phone included so server actions (e.g. quote requests) can identify the dealer without
  // re-asking — QA 16 Jul: logged-in dealers couldn't send quotes ("Name and phone required").
  return { id: c.id, name: c.name, phone: c.phone ?? "" };
}

/**
 * A returning wholesale buyer recognised by the bd_wholesale cookie — regardless of the
 * "approved" flag. Used to PREFILL the checkout billing form so a repeat buyer doesn't retype
 * their details, and to show their order history. NOT a security gate (browsing & ordering are
 * open); it only remembers who last checked out on this device.
 */
export type WholesaleIdentity = { id: string; name: string; phone: string; gstin: string; address: string };
export async function getWholesaleIdentity(): Promise<WholesaleIdentity | null> {
  const id = cookies().get("bd_wholesale")?.value;
  if (!id) return null;
  const { data } = await supabaseServer()
    .from("customers").select("id,name,phone,gstin,address,type").eq("id", id).maybeSingle();
  const c = data as any;
  if (!c) return null;
  return { id: c.id, name: c.name ?? "", phone: c.phone ?? "", gstin: c.gstin ?? "", address: c.address ?? "" };
}

/** scrypt password hashing for self-service trade accounts. Format: s2$<salt-hex>$<hash-hex>. */
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 32).toString("hex");
  return `s2$${salt}$${hash}`;
}
export function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "s2" || !salt || !hash) return false;
  const test = scryptSync(pw, salt, 32).toString("hex");
  const a = Buffer.from(test, "hex"); const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
