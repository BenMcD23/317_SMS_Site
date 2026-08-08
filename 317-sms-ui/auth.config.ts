import type { NextAuthConfig } from "next-auth"
import type { JWT } from "next-auth/jwt"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"

// The client sends the raw Google id_token to the API, and Google only issues
// those with a 1-hour life. Refresh with this much headroom left so a token
// handed to the browser stays valid until the next session refetch — otherwise
// the API 401s and the UI bounces the user through Google again.
const REFRESH_MARGIN_S = 10 * 60

const NCO_ALLOWED_ROUTES = ["/", "/assessments", "/cadets/assessments", "/settings"]
const INSPECTION_ROUTE = "/assessments/inspection"

function under(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(route + "/")
}

function idTokenExp(idToken: string): number {
  try {
    // atob, not Buffer — this runs on the edge (middleware) too.
    const b64 = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
    return JSON.parse(atob(b64)).exp ?? 0
  } catch {
    return 0
  }
}

/**
 * Renew the Google tokens once they're within REFRESH_MARGIN_S of expiry.
 * Plain `fetch` only, so it runs in middleware as well as in Node — middleware
 * re-signs the session cookie on every navigation, and if it did that with a
 * stale token it would clobber a refresh the /api/auth/session route had just
 * written. Group-membership lookup needs googleapis and stays in auth.ts.
 */
export async function withFreshTokens(token: JWT): Promise<JWT> {
  const now = Math.floor(Date.now() / 1000)
  if ((token.expires_at ?? 0) > now + REFRESH_MARGIN_S) return token
  if (!token.refresh_token) return { ...token, error: "RefreshTokenMissing" }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
      }),
    })
    if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
    const refreshed = await res.json()

    // Google normally returns a fresh id_token here. If it didn't and the one
    // we're holding is already dead, flag it rather than handing the API a
    // token it will reject.
    const idToken = refreshed.id_token ?? token.id_token
    if (!refreshed.id_token && idTokenExp(idToken as string) < now + 60) {
      return { ...token, error: "RefreshAccessTokenError" }
    }
    return {
      ...token,
      id_token: idToken,
      expires_at: Math.floor(Date.now() / 1000) + refreshed.expires_in,
      refresh_token: refreshed.refresh_token ?? token.refresh_token,
      error: undefined,
    }
  } catch (e) {
    console.error("[jwt] token refresh failed:", e)
    return { ...token, error: "RefreshAccessTokenError" }
  }
}

// staff see everything; SNCOs get the NCO routes plus inspections; NCOs get the
// NCO routes minus inspections.
function canAccess(role: string, pathname: string): boolean {
  if (role === "staff") return true
  if (under(pathname, INSPECTION_ROUTE)) return role === "snco"
  return NCO_ALLOWED_ROUTES.some((route) => under(pathname, route))
}

export const authConfig: NextAuthConfig = {
  cookies: {
    sessionToken: { name: "sms.session-token", options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production" } },
    callbackUrl: { name: "sms.callback-url", options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production" } },
    csrfToken: { name: "sms.csrf-token", options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production" } },
    pkceCodeVerifier: { name: "sms.pkce.code_verifier", options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production" } },
    state: { name: "sms.state", options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production" } },
    nonce: { name: "sms.nonce", options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production" } },
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
    // ponytail: dev-only fake login for local Playwright/UI testing.
    // Inert unless AUTH_DEV_BYPASS=1 (never set in production).
    ...(process.env.AUTH_DEV_BYPASS === "1"
      ? [
          Credentials({
            credentials: {},
            authorize: () => ({
              email: "ci.mcdonald@317atc.co.uk",
              name: "Dev Bypass",
            }),
          }),
        ]
      : []),
  ],
  pages: {
    signIn: "/login",
    // Send auth failures to /login rather than @auth/core's bare "server
    // configuration" page. If a session did get created (a raced callback
    // throws after the cookie is set), middleware bounces /login straight to /.
    error: "/login",
  },
  callbacks: {
    // Refresh-only in this instance; auth.ts overrides it to add the sign-in
    // branch and the Workspace-group role lookup.
    jwt: ({ token }) => withFreshTokens(token),
    session({ session, token }) {
      session.id_token = token.id_token
      session.role = token.role
      session.error = token.error
      return session
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isLoginPage = nextUrl.pathname === "/login"
      const isUnauthorizedPage = nextUrl.pathname === "/unauthorized"

      if (isLoginPage) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl))
        return true
      }

      if (!isLoggedIn) return Response.redirect(new URL("/login", nextUrl))

      // Always allow the unauthorized page for logged-in users
      if (isUnauthorizedPage) return true

      // Block users with no recognised role
      if (!auth.role) return Response.redirect(new URL("/unauthorized", nextUrl))

      if (!canAccess(auth.role, nextUrl.pathname)) {
        return Response.redirect(new URL("/unauthorized", nextUrl))
      }

      return true
    },
  },
}
