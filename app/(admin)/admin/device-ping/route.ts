export const dynamic = "force-dynamic";
import { supabaseServer } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { classifyDevice } from "@/lib/deviceClass";

/** Records which device type opens which admin screen (phone / tablet / PC, and whether it is
 *  the Android app). Middleware on /admin/* already blocks anyone not signed in.
 *  Best-effort: always answers 204 so it can never disturb the counter. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const path = typeof body?.path === "string" ? body.path.slice(0, 200) : null;
    const app = body?.app === true;
    const ua = req.headers.get("user-agent") ?? "";
    const d = classifyDevice(ua, app);
    let role: string | null = null;
    try { role = getSession().roleName ?? null; } catch { /* */ }
    await supabaseServer().from("device_visits").insert({ role, path, device: d.device, os: d.os, browser: d.browser });
  } catch { /* never break the console for analytics */ }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
