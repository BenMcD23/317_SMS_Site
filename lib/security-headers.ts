/**
 * Response headers for every page: a Content-Security-Policy plus the usual
 * transport and framing headers.
 *
 * Built here rather than inline in next.config.ts so it can be tested. The
 * point of the CSP on this site is `connect-src`: the Google ID token lives in
 * the browser session and most pages call the API directly with it, so an XSS
 * is otherwise free to post that token to any origin. Pinning connect-src to
 * this site and the API stops that.
 *
 * `script-src` keeps 'unsafe-inline' because the App Router injects inline
 * bootstrap scripts and no nonce is plumbed through the auth middleware. That
 * weakens containment of an injection but not the exfiltration limit above; a
 * nonce is the follow-up.
 */

type Header = { key: string; value: string };

/** The origin of the API, or null if the base isn't an absolute URL. */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(apiBase: string, isDev: boolean): string {
  const api = originOf(apiBase);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Next's dev server needs eval for React's debugging; production doesn't.
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    // blob:/data: are the signature and gallery previews; the gallery page also
    // shows images straight from the website's GitHub repo.
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://raw.githubusercontent.com",
      "https://*.googleusercontent.com",
    ],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(api ? [api] : []), ...(isDev ? ["ws:", "wss:"] : [])],
    // Assessment PDFs preview in a blob: iframe. Chrome's PDF viewer also needs
    // object-src to allow blob:, or the preview comes up blank.
    "frame-src": ["'self'", "blob:"],
    "object-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "base-uri": ["'self'"],
    // Sign-in is a form POST that redirects to Google, and Chrome checks
    // form-action against the redirect target too.
    "form-action": ["'self'", "https://accounts.google.com"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

export function securityHeaders(apiBase: string, isDev: boolean): Header[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(apiBase, isDev) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // The vp-sync page talks to the Bader portal through window.opener and
    // postMessage, which a stricter Cross-Origin-Opener-Policy would sever, so
    // that header is deliberately not set.
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    // Browsers ignore HSTS on plain http, so this is harmless on localhost.
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  ];
}
