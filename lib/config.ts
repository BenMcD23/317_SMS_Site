export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// Sole owner/maintainer — gates developer-only views (e.g. /backups, /usage).
// Mirrors OWNER_EMAIL in the API's core/config.py.
export const OWNER_EMAIL = "ci.mcdonald@317atc.co.uk";

// Officer Commanding — gates the OC dashboard and the sidebar's OC-only links.
// Mirrors OC_EMAIL in the API's core/config.py (comma-separated). This is a
// cosmetic gate only; the backend's require_oc dependency is the real enforcement.
export const OC_EMAILS = (process.env.NEXT_PUBLIC_OC_EMAIL || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** True only if this email is one of the configured OC_EMAILS (matches the
 * backend's is_oc — no owner backdoor). False when none are configured. */
export function isOc(email?: string | null): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return !!e && OC_EMAILS.includes(e);
}

// The cadet portal's address, which the lesson QR codes open. No default: a QR
// printed on slides with the wrong address would send every cadet nowhere.
export const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || "";
