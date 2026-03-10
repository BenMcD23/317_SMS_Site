import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

export const { auth: middleware } = NextAuth(authConfig)

// Specify which routes the middleware should protect
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.jpg).*)"],
}