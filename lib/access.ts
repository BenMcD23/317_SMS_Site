/** Which routes each role may reach. Single source of truth for both the
 *  middleware gate (auth.config.ts) and the sidebar (components/app-shell.tsx),
 *  so a link is only ever shown if navigating to it would actually work. */

const NCO_ALLOWED_ROUTES = [
  "/",
  "/stats",
  "/assessments",
  "/cadets/assessments",
  "/session-plans",
  // Tonight's door: NCOs tick in cadets without their phone.
  "/check-in",
  "/nco-holidays",
  "/nco-comments",
  "/settings",
  // The phone's section hubs: each lists only what the role can reach.
  "/m",
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

/** Pages only the owner may open: backups and usage analytics. The API enforces it too. */
const OWNER_ROUTES = ["/backups", "/usage"];

/**
 * Whether the page is the owner's alone. Checked in the middleware next to
 * `canAccess`, so another staff member is sent to /unauthorized like any other
 * page they can't open, instead of loading the page to find it says no.
 */
export function isOwnerOnly(pathname: string): boolean {
  return OWNER_ROUTES.some((route) => under(pathname, route));
}
