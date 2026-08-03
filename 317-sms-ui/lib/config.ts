export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// Sole owner/maintainer — gates developer-only views (e.g. /api-logs).
// Mirrors OWNER_EMAIL in the API's core/config.py.
export const OWNER_EMAIL = "ci.mcdonald@317atc.co.uk";

// No OC_EMAIL here — the API returns `is_oc` on the committee/OC endpoints,
// same as it does for roles, so the frontend never needs to know the address.