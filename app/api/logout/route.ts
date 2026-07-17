import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Clears the admin session cookies and sends the user to /login. Used by the idle-timeout
 * watcher (IdleLogout) and reachable directly. GET so a plain redirect/link works.
 * ?reason=idle shows the "signed out for inactivity" note on the login screen.
 */
export function GET(req: NextRequest) {
  const idle = req.nextUrl.searchParams.get("reason") === "idle";
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = idle ? "?idle=1" : "";
  const res = NextResponse.redirect(url);
  for (const name of ["bd_session", "bd_role", "bd_rolename", "bd_perms", "bd_lang"]) {
    res.cookies.set(name, "", { httpOnly: true, path: "/", maxAge: 0 });
  }
  return res;
}
