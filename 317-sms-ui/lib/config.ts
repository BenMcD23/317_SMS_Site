export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// Sole owner/maintainer — gates developer-only views (e.g. /api-logs).
// Mirrors OWNER_EMAIL in the API's core/config.py.
export const OWNER_EMAIL = "ci.mcdonald@317atc.co.uk";

// Public base URL of the cadet website, used to preview staff/NCO photos in the
// photo manager (images are served from `${CADET_SITE}/people/...`). Set
// NEXT_PUBLIC_CADET_SITE to the live site; defaults to the production domain.
export const CADET_SITE = process.env.NEXT_PUBLIC_CADET_SITE || "https://317atc.co.uk";