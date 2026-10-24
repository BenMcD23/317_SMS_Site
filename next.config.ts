import type { NextConfig } from "next";

import { API_BASE } from "./lib/config";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // Otherwise `next dev` appends its own block to CLAUDE.md whenever it sees an
  // AI agent running it, leaving a stray diff in every session.
  agentRules: false,
  // `radix-ui` (the single consolidated package shadcn/ui imports from) has
  // hundreds of named exports; without this every page bundles the whole
  // package. lucide-react is already in Next's built-in default list.
  // Keep old bookmarks working: the leaving process moved under the OC section,
  // and Theory Progress and Classification Day became one Classifications page.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(API_BASE, process.env.NODE_ENV !== "production") }];
  },
  async redirects() {
    return [
      { source: "/cadets/leaving", destination: "/oc/leaving", permanent: false },
      { source: "/cadets/classification-day", destination: "/cadets/classifications", permanent: false },
      { source: "/cadets/theory", destination: "/cadets/classifications?tab=progress", permanent: false },
    ];
  },
  experimental: {
    optimizePackageImports: ["radix-ui"],
  },
};

export default nextConfig;
