import NextAuth from "next-auth";
import type { NextFetchEvent, NextRequest } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

const SESSION_COOKIE = "sms.session-token";

/**
 * Route guard only — middleware reads the session, it never owns it.
 *
 * Auth.js re-signs the session cookie on every request it handles, using the
 * token it decoded when the request started. That makes any slow work inside
 * the middleware a window in which a *newer* cookie — one the OAuth callback or
 * /api/auth/session wrote in the meantime — gets overwritten by the older token
 * this request happened to read, silently signing the user out. Next prefetches
 * routes, so several of these are usually in flight at once.
 *
 * Two halves to keeping that shut: auth.config.ts deliberately has no `jwt`
 * callback (so nothing here waits on Google), and the session cookie is dropped
 * from the response below. The Node routes handle renewal and expiry.
 */
export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const handle = auth as unknown as (request: NextRequest, event: NextFetchEvent) => Promise<Response>;
  const response = await handle(request, event);

  const headers = new Headers();
  for (const [name, value] of response.headers) {
    if (name.toLowerCase() !== "set-cookie") headers.set(name, value);
  }
  for (const cookie of response.headers.getSetCookie()) {
    if (!cookie.startsWith(`${SESSION_COOKIE}=`)) headers.append("set-cookie", cookie);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const config = {
  // Note: `api/` (with slash) so real /api/* routes (NextAuth) are excluded,
  // but app pages like /api-logs are still covered by the auth middleware.
  // vp-sync-collector.js is loaded into a Volunteer Portal tab, where the SMS
  // session cookie isn't sent, so it must not bounce to /login. It holds no
  // data; everything it sends goes through the signed-in VP Sync page.
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|vp-sync-collector\\.js$|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
