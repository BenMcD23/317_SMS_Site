import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";

const API = "https://api.317.example.com/v1";

function directive(csp: string, name: string): string[] {
  const found = csp.split("; ").find((d) => d.startsWith(`${name} `));
  return found ? found.split(" ").slice(1) : [];
}

describe("contentSecurityPolicy", () => {
  it("pins connect-src to this site and the API origin, so a stolen token can't be posted elsewhere", () => {
    expect(directive(contentSecurityPolicy(API, false), "connect-src")).toEqual([
      "'self'",
      "https://api.317.example.com",
    ]);
  });

  it("still builds when the API base isn't an absolute URL", () => {
    expect(directive(contentSecurityPolicy("", false), "connect-src")).toEqual(["'self'"]);
    expect(directive(contentSecurityPolicy("not a url", false), "connect-src")).toEqual(["'self'"]);
  });

  it("allows eval and websockets only in dev", () => {
    expect(directive(contentSecurityPolicy(API, false), "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(contentSecurityPolicy(API, true), "script-src")).toContain("'unsafe-eval'");
    expect(directive(contentSecurityPolicy(API, false), "connect-src")).not.toContain("ws:");
    expect(directive(contentSecurityPolicy(API, true), "connect-src")).toContain("ws:");
  });

  it("keeps the blob: and data: sources the signature, PDF and download flows need", () => {
    const csp = contentSecurityPolicy(API, false);
    expect(directive(csp, "img-src")).toEqual(expect.arrayContaining(["blob:", "data:"]));
    expect(directive(csp, "frame-src")).toContain("blob:");
    expect(directive(csp, "object-src")).toContain("blob:");
  });

  it("lets the Google sign-in form redirect, and forbids framing the site", () => {
    const csp = contentSecurityPolicy(API, false);
    expect(directive(csp, "form-action")).toContain("https://accounts.google.com");
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
  });
});

describe("securityHeaders", () => {
  it("sends the full set on every page", () => {
    const keys = securityHeaders(API, false).map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "Content-Security-Policy",
        "X-Frame-Options",
        "X-Content-Type-Options",
        "Referrer-Policy",
        "Permissions-Policy",
        "Strict-Transport-Security",
      ])
    );
  });
});
