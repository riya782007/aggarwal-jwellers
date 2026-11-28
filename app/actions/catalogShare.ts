"use server";
import { getSession } from "@/lib/auth";
import { makeWholesalePass, wholesalePassSecret, WHOLESALE_PASS_DAYS } from "@/lib/wholesalePass";

/** A wholesale pass for a shared catalogue link — staff/owner only (dealers and visitors get null). */
export async function wholesaleSharePassAction(): Promise<string | null> {
  if (!getSession().authed) return null;
  return makeWholesalePass(wholesalePassSecret(), Date.now() + WHOLESALE_PASS_DAYS * 86_400_000);
}
