/** Which routes each role may reach. Single source of truth for both the
 *  middleware gate (auth.config.ts) and the sidebar (components/app-shell.tsx),
 *  so a link is only ever shown if navigating to it would actually work. */

const NCO_ALLOWED_ROUTES = [
  "/",
  "/assessments",
  "/cadets/assessments",
  "/session-plans",
  "/nco-holidays",
  "/nco-comments",
  "/settings",
]
const INSPECTION_ROUTE = "/assessments/inspection"

function under(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(route + "/")
}

// staff see everything; SNCOs get the NCO routes plus inspections; NCOs get the
// NCO routes minus inspections.
export function canAccess(role: string | undefined, pathname: string): boolean {
  if (role === "staff") return true
  if (under(pathname, INSPECTION_ROUTE)) return role === "snco"
  return NCO_ALLOWED_ROUTES.some((route) => under(pathname, route))
}
