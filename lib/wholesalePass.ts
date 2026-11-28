/**
 * lib/wholesalePass.ts — a signed "wholesale pass" for SHARED catalogue links (owner request, Nov 2026).
 *
 * The catalogue only shows trade rates to a logged-in staff member or dealer, so a ?view=wholesale link
 * opened on a customer's phone fell back to RETAIL prices. When staff share in Wholesale view, the link now
 * carries `wt=<pass>`: an expiry plus an HMAC signed with the server's secret. Only staff can mint one
 * (app/actions/catalogShare.ts); nobody can forge or extend it, and it stops working after
 * WHOLESALE_PASS_DAYS. Pure + DOM-free so it is unit-tested.
 */
import { createHmac, timingSafeEqual } from "crypto";

export const WHOLESALE_PASS_DAYS = 30;

const sign = (secret: string, exp: string) =>
  createHmac("sha256", `${secret}|aj-wholesale-pass-v1`).update(exp).digest("base64url").slice(0, 22);

/** Pass valid until `expMs` (epoch ms). Format: <exp base36>.<signature>. */
export function makeWholesalePass(secret: string, expMs: number): string {
  const exp = Math.floor(expMs / 1000).toString(36);
  return `${exp}.${sign(secret, exp)}`;
}

/** True only for an untampered, unexpired pass signed with this secret. */
export function checkWholesalePass(secret: string, token: string | null | undefined, nowMs: number): boolean {
  if (!secret || !token || token.length > 64) return false;
  const [exp, sig, extra] = token.split(".");
  if (!exp || !sig || extra !== undefined || !/^[0-9a-z]+$/.test(exp)) return false;
  const want = Buffer.from(sign(secret, exp));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  return parseInt(exp, 36) * 1000 > nowMs;
}

/** The server secret (same deployment secrets the login session is derived from). */
export const wholesalePassSecret = () =>
  `${process.env.ADMIN_SESSION_TOKEN ?? ""}|${process.env.OWNER_PASSCODE ?? ""}`;
