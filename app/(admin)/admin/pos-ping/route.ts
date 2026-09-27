export const dynamic = "force-dynamic";

/** Lightweight keepalive for the counter. Middleware on /admin/* slides the session cookie. */
export async function GET() {
  return new Response("ok", {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
