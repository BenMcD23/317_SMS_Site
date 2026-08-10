import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { canAccess } from "./lib/access"

/** Accounts the dev bypass can log in as — must match the API's
 *  `_dev_fake_email` so the fake token resolves to the same role there. */
export const DEV_USERS = {
  staff: { email: "ci.mcdonald@317atc.co.uk", name: "Dev Staff" },
  snco: { email: "dev.snco@317atc.co.uk", name: "Dev SNCO" },
  nco: { email: "dev.nco@317atc.co.uk", name: "Dev NCO" },
} as const

export type DevRole = keyof typeof DEV_USERS

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
      // access_type=offline is what asks for a refresh token. `prompt` is
      // deliberately absent: an automatic re-auth (a renewal that failed, or a
      // token that died while the tab was closed) then completes as a silent
      // Google redirect instead of a consent screen the user has to click
      // through — which is what "it asks me to log in every time" actually was.
      // The two places that mean "log in properly" — the login button and the
      // explicit "sign in again" — pass prompt=consent themselves, and that is
      // what mints a fresh refresh token.
      authorization: { params: { access_type: "offline" } },
    }),
    // ponytail: dev-only fake login for local Playwright/UI testing.
    // Inert unless AUTH_DEV_BYPASS=1 (never set in production).
    ...(process.env.AUTH_DEV_BYPASS === "1"
      ? [
          Credentials({
            credentials: { role: {} },
            authorize: (c) => {
              const role = String(c?.role ?? "staff")
              return { id: role, ...(DEV_USERS[role as DevRole] ?? DEV_USERS.staff) }
            },
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
    // No `jwt` callback here on purpose. This config is what middleware runs,
    // and middleware must not renew tokens: see the note in middleware.ts.
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
