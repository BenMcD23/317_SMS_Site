import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"

const NCO_ALLOWED_ROUTES = ["/", "/assessments", "/cadets/assessments", "/settings"]

function ncoCanAccess(pathname: string): boolean {
  return NCO_ALLOWED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  )
}

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    session({ session, token }) {
      session.role = token.role
      return session
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isLoginPage = nextUrl.pathname === "/login"

      if (isLoginPage) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl))
        return true
      }

      if (!isLoggedIn) return Response.redirect(new URL("/login", nextUrl))

      // Block users with no recognised role
      if (!auth.role) return Response.redirect(new URL("/login", nextUrl))

      // NCOs can only access their permitted routes
      if (auth.role === "nco" && !ncoCanAccess(nextUrl.pathname)) {
        return Response.redirect(new URL("/", nextUrl))
      }

      return true
    },
  },
}
