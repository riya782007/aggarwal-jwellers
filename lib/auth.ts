import "server-only";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseServer } from "@/lib/supabase/server";

/** Owner gets full access; staff get a per-role scoped session.
 *
 * SECURITY (fixed 17 Jul): the session cookie VALUE must not be a fixed, public string.
 * This repo is public, so the old default "bd-owner-session-v1" let anyone set that cookie
 * and walk into the owner console with no passcode. The token is now a SHA-256 derived from
 * the deployment's SECRETS (ADMIN_SESSION_TOKEN and the owner passcode) — unguessable from the
 * source alone, and it automatically rotates if either secret changes. A random per-boot salt
 * would log everyone out on redeploy, so we derive deterministically from configured secrets
 * instead. Set ADMIN_SESSION_TOKEN (and a custom OWNER_PASSCODE) in the environment. */
const secretSeed = () =>
  `${process.env.ADMIN_SESSION_TOKEN ?? ""}|${process.env.OWNER_PASSCODE ?? ""}|aj-session-v2`;
const derive = (scope: string) => createHash("sha256").update(scope + "|" + secretSeed()).digest("hex");

export const OWNER_TOKEN = () => derive("owner");
export const STAFF_TOKEN = () => derive("staff");

export type Session = {
  authed: boolean;
  isOwner: boolean;
  roleId: string;
  roleName: string;
  permissions: string[] | "*";
};

/** Read the current session from cookies (set at login). Synchronous, no DB. */
export function getSession(): Session {
  const c = cookies();
  const s = c.get("bd_session")?.value;
  const isOwner = s === OWNER_TOKEN();
  const authed = isOwner || s === STAFF_TOKEN();
  const permsRaw = c.get("bd_perms")?.value ?? "";
  return {
    authed,
    isOwner,
    roleId: c.get("bd_role")?.value ?? "",
    roleName: c.get("bd_rolename")?.value ?? (isOwner ? "Owner" : "Staff"),
    permissions: isOwner ? "*" : (permsRaw ? permsRaw.split(",").filter(Boolean) : []),
  };
}

/** Console language for this request — set at login from the role / owner preference,
 *  switchable any time via the sidebar toggle (setLangAction). */
export function getLang(): "en" | "hi" {
  return cookies().get("bd_lang")?.value === "hi" ? "hi" : "en";
}

/** Does this session grant `perm`? Owner always true; undefined perm = open to all signed-in. */
export function can(session: Session, perm?: string): boolean {
  if (!perm) return true;
  if (session.permissions === "*") return true;
  return session.permissions.includes(perm);
}

/**
 * AUTHORITATIVE permissions — re-read from the database by role id, so a tampered
 * `bd_perms` cookie can never escalate access. Use this for ENFORCEMENT in actions
 * and on sensitive pages. (getSession's cookie copy is fine only for hiding UI.)
 */
export async function authoritativePerms(): Promise<string[] | "*"> {
  const c = cookies();
  const session = c.get("bd_session")?.value;
  if (session === OWNER_TOKEN()) return "*";
  if (session !== STAFF_TOKEN()) return []; // not authenticated as staff
  const roleId = c.get("bd_role")?.value;
  if (!roleId) return [];
  const { data } = await supabaseServer().from("roles").select("permissions").eq("id", roleId).maybeSingle();
  return ((data as any)?.permissions as string[]) ?? [];
}

/** True if the current request is allowed to use `perm`. Authoritative (DB-backed). */
export async function requirePerm(perm: string): Promise<boolean> {
  const p = await authoritativePerms();
  return p === "*" || p.includes(perm);
}
