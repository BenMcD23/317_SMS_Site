import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

const { auth } = NextAuth(authConfig)

export default auth

export const config = {
  // Note: `api/` (with slash) so real /api/* routes (NextAuth) are excluded,
  // but app pages like /api-logs are still covered by the auth middleware.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
}