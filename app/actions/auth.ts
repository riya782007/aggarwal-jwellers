"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { OWNER_TOKEN, STAFF_TOKEN } from "@/lib/auth";

const OWNER_PASSCODE = () => process.env.OWNER_PASSCODE ?? "aggarwal2026";
const COOKIE = { httpOnly: true, sameSite: "lax" as const, secure: true, path: "/", maxAge: 60 * 60 * 12 };

export async function loginAction(formData: FormData) {
  const code = String(formData.get("passcode") ?? "").trim();
  const next = String(formData.get("next") ?? "/admin/dashboard");
  const dest = next.startsWith("/admin") ? next : "/admin/dashboard";
  const c = cookies();

  // 1) Owner passcode → full access.
  if (code === OWNER_PASSCODE()) {
    c.set("bd_session", OWNER_TOKEN(), COOKIE);
    c.set("bd_role", "owner", COOKIE);
    c.set("bd_rolename", "Owner", COOKIE);
    c.set("bd_perms", "*", COOKIE);
    // Console language — the owner's saved preference (English by default).
    let lang = "en";
    try {
      const { data } = await supabaseServer().from("doc_settings").select("owner_lang").eq("id", 1).maybeSingle();
      if ((data as any)?.owner_lang === "hi") lang = "hi";
    } catch { /* column may predate migration 0044 */ }
    c.set("bd_lang", lang, COOKIE);
    redirect(dest);
  }

  // 2) Role passcode → scoped staff session.
  if (code) {
    const { data: role } = await supabaseServer()
      .from("roles").select("id,name,permissions,lang").eq("passcode", code.toUpperCase()).maybeSingle();
    if (role) {
      const perms: string[] = (role as any).permissions ?? [];
      c.set("bd_session", STAFF_TOKEN(), COOKIE);
      c.set("bd_role", (role as any).id, COOKIE);
      c.set("bd_rolename", (role as any).name, COOKIE);
      c.set("bd_perms", perms.join(","), COOKIE);
      c.set("bd_lang", (role as any).lang === "hi" ? "hi" : "en", COOKIE);
      redirect(dest);
    }
  }

  redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
}

export async function logoutAction() {
  const c = cookies();
  for (const k of ["bd_session", "bd_role", "bd_rolename", "bd_perms", "bd_lang"]) c.set(k, "", { httpOnly: true, path: "/", maxAge: 0 });
  redirect("/login");
}

/** Switch the console language (English / हिन्दी) and remember it — on the role for
 *  staff (the role is the user in this passcode model) and on doc_settings for the owner. */
export async function setLangAction(formData: FormData) {
  const lang = String(formData.get("lang")) === "hi" ? "hi" : "en";
  const c = cookies();
  c.set("bd_lang", lang, COOKIE);
  try {
    const session = c.get("bd_session")?.value;
    if (session === OWNER_TOKEN()) {
      await supabaseServer().from("doc_settings").update({ owner_lang: lang }).eq("id", 1);
    } else if (session === STAFF_TOKEN()) {
      const roleId = c.get("bd_role")?.value;
      if (roleId) await supabaseServer().from("roles").update({ lang }).eq("id", roleId);
    }
  } catch { /* persistence is best-effort; the cookie already switched the UI */ }
  revalidatePath("/admin", "layout");
}
