import type { NextConfig } from "next";

// The Google ID token is put on the session and read in the browser, and most
// pages call the API directly with it, so an XSS would hand an attacker a token
// that stays valid for up to an hour. connect-src is therefore the directive
// that earns its keep here: it stops injected script from posting that token to
// an origin we don't control.
//
// script-src still needs 'unsafe-inline' — the App Router injects inline
// bootstrap scripts and we don't plumb a nonce through the auth middleware. That
// weakens containment of an injection, but the exfiltration limits still hold.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

const csp = [
  "default-src 'self'",
  // 'unsafe-eval' is React Fast Refresh in dev only; production builds don't need it.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // blob:/data: cover signature previews and the generated-document downloads.
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  // next/font self-hosts Geist at build time, so no external font origin.
  "font-src 'self' data:",
  `connect-src 'self' ${API_BASE}`,
  "worker-src 'self' blob:",
  // accounts.google.com is required: the NextAuth sign-in POST redirects there,
  // and browsers apply form-action across that redirect.
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Keeps the ID token out of Referer if it ever ends up in a URL.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
