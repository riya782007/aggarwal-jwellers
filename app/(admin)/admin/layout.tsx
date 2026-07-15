import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { Diva } from "@/components/admin/Diva";
import { PrivacyShield } from "@/components/admin/PrivacyShield";
import { getSession, getLang } from "@/lib/auth";
import { countNewWebsiteOrders } from "@/lib/supabase/queries";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = getSession();
  const lang = getLang();
  // Defense-in-depth: never render the console for an unauthenticated request.
  if (!s.authed) redirect("/login");
  // Nav badges — pending submissions awaiting review (best-effort; never block the console).
  let pendingSubmissions = 0;
  let newWebOrders = 0;
  try {
    const { count } = await supabaseServer().from("product_submissions").select("id", { count: "exact", head: true }).eq("status", "pending");
    pendingSubmissions = count ?? 0;
    newWebOrders = await countNewWebsiteOrders();
  } catch { /* badges are optional */ }
  return (
    <div className="flex min-h-screen bg-diva-cream">
      <AdminNav perms={s.permissions} roleName={s.roleName} lang={lang} badges={{ "/admin/submissions": pendingSubmissions, "/admin/orders": newWebOrders }} />
      {/* pt-14 clears the fixed mobile top bar; lg has the in-flow sidebar instead.
          PrivacyShield wraps the content so the "Hide figures" toggle + Ctrl+Shift+H work on EVERY page. */}
      <PrivacyShield className="flex-1 min-w-0 pt-14 lg:pt-0" lang={lang}>{children}</PrivacyShield>
      <Diva roleName={s.roleName} />
    </div>
  );
}
