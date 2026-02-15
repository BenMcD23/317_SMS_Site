import { auth } from "@/auth"

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isLoginPage = req.nextUrl.pathname === "/login"

  // 1. If not logged in and trying to access tools, redirect to login
  if (!isLoggedIn && !isLoginPage) {
    return Response.redirect(new URL("/login", req.nextUrl))
  }

  // 2. If already logged in and hitting login page, redirect to home
  if (isLoggedIn && isLoginPage) {
    return Response.redirect(new URL("/", req.nextUrl))
  }
})

// Specify which routes the middleware should protect
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}