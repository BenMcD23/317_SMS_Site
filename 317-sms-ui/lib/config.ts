export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// Sole owner/maintainer — gates developer-only views (e.g. /api-logs).
// Mirrors OWNER_EMAIL in the API's core/config.py.
export const OWNER_EMAIL = "ci.mcdonald@317atc.co.uk";

// Officer Commanding — gates the OC dashboard and the committee-request approval
// actions. Mirrors OC_EMAIL in the API's core/config.py. This is a cosmetic
// gate only; the backend's require_oc dependency is the real enforcement.
export const OC_EMAIL = process.env.NEXT_PUBLIC_OC_EMAIL || "";

/** True if this email is the OC (or the owner, matching the backend's is_oc). */
export function isOc(email?: string | null): boolean {
  const e = (email ?? "").toLowerCase();
  if (!e) return false;
  const allowed = [OWNER_EMAIL.toLowerCase()];
  if (OC_EMAIL) allowed.push(OC_EMAIL.toLowerCase());
  return allowed.includes(e);
}