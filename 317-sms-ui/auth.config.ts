import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"

const NCO_ALLOWED_ROUTES = ["/", "/assessments", "/cadets/assessments", "/settings"]
const INSPECTION_ROUTE = "/assessments/inspection"

function under(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(route + "/")
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
    session({ session, token }) {
      session.role = token.role
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
