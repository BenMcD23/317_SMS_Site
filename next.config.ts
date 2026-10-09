import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Otherwise `next dev` appends its own block to CLAUDE.md whenever it sees an
  // AI agent running it, leaving a stray diff in every session.
  agentRules: false,
  // `radix-ui` (the single consolidated package shadcn/ui imports from) has
  // hundreds of named exports; without this every page bundles the whole
  // package. lucide-react is already in Next's built-in default list.
  experimental: {
    optimizePackageImports: ["radix-ui"],
  },
};

export default nextConfig;
