import type { NextConfig } from "next";

import { API_BASE } from "./lib/config";
import { securityHeaders } from "./lib/security-headers";

// The old Classifications page kept its tab in ?tab=; each tab is a Training
// page now. The first match wins, so the tabbed ones come before the plain one.
// Next keeps the old query string on a redirect; ?tab= on a Training page is
// ignored, so that's harmless.
export const CLASSIFICATIONS_REDIRECTS = [
  ...(
    [
      ["progress", "/training/progress"],
      ["record", "/training/progress"],
      ["qr", "/training/qr-codes"],
    ] as const
  ).map(([tab, destination]) => ({
    source: "/cadets/classifications",
    has: [{ type: "query" as const, key: "tab", value: tab }],
    destination,
    permanent: false,
  })),
  { source: "/cadets/classifications", destination: "/training", permanent: false },
];

const nextConfig: NextConfig = {
  // Otherwise `next dev` appends its own block to CLAUDE.md whenever it sees an
  // AI agent running it, leaving a stray diff in every session.
  agentRules: false,
  // `radix-ui` (the single consolidated package shadcn/ui imports from) has
  // hundreds of named exports; without this every page bundles the whole
  // package. lucide-react is already in Next's built-in default list.
  // Keep old bookmarks working: the leaving process moved under the OC section,
  // and Theory Progress, Classification Day and then Classifications moved into
  // Training, one page per old tab.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(API_BASE, process.env.NODE_ENV !== "production") }];
  },
  async redirects() {
    return [
      { source: "/cadets/leaving", destination: "/oc/leaving", permanent: false },
      ...CLASSIFICATIONS_REDIRECTS,
      { source: "/cadets/classification-day", destination: "/training", permanent: false },
      { source: "/cadets/theory", destination: "/training/progress", permanent: false },
    ];
  },
  experimental: {
    optimizePackageImports: ["radix-ui"],
  },
};

export default nextConfig;
