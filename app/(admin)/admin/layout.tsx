import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { Diva } from "@/components/admin/Diva";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = getSession();
  // Defense-in-depth: never render the console for an unauthenticated request.
  if (!s.authed) redirect("/login");
  return (
    <div className="admin-shell flex min-h-screen bg-diva-cream">
      <AdminNav perms={s.permissions} roleName={s.roleName} />
      {/* pt-16 clears the fixed mobile top bar; lg has the in-flow sidebar instead */}
      <div className="flex-1 min-w-0 pt-16 lg:pt-0">{children}</div>
      <Diva roleName={s.roleName} />
    </div>
  );
}
