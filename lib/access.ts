/** Which routes each role may reach. Single source of truth for both the
 *  middleware gate (auth.config.ts) and the sidebar (components/app-shell.tsx),
 *  so a link is only ever shown if navigating to it would actually work. */

const NCO_ALLOWED_ROUTES = [
  "/",
  "/stats",
  "/assessments",
  "/cadets/assessments",
  "/session-plans",
  "/nco-holidays",
  "/nco-comments",
  "/settings",
];
const INSPECTION_ROUTE = "/assessments/inspection";
const MOI_ROUTE = "/assessments/moi";

function under(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(route + "/");
}

// staff see everything; SNCOs get the NCO routes plus inspections; NCOs get the
// NCO routes minus inspections. The MOI sheet is staff only.
export function canAccess(role: string | undefined, pathname: string): boolean {
  if (role === "staff") return true;
  if (under(pathname, MOI_ROUTE)) return false;
  if (under(pathname, INSPECTION_ROUTE)) return role === "snco";
  return NCO_ALLOWED_ROUTES.some((route) => under(pathname, route));
}
