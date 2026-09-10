export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// Sole owner/maintainer — gates developer-only views (e.g. /api-logs).
// Mirrors OWNER_EMAIL in the API's core/config.py.
export const OWNER_EMAIL = "ci.mcdonald@317atc.co.uk";

// Officer Commanding — gates the OC dashboard and the sidebar's OC-only links.
// Mirrors OC_EMAIL in the API's core/config.py. This is a cosmetic gate only;
// the backend's require_oc dependency is the real enforcement.
export const OC_EMAIL = process.env.NEXT_PUBLIC_OC_EMAIL || "";

/** True only if this email matches the configured OC_EMAIL (matches the backend's
 * is_oc — no owner backdoor). False when OC_EMAIL is unset. */
export function isOc(email?: string | null): boolean {
  const e = (email ?? "").toLowerCase();
  return !!e && !!OC_EMAIL && e === OC_EMAIL.toLowerCase();
}