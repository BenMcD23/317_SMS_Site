import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `radix-ui` (the single consolidated package shadcn/ui imports from) has
  // hundreds of named exports; without this every page bundles the whole
  // package. lucide-react is already in Next's built-in default list.
  experimental: {
    optimizePackageImports: ["radix-ui"],
  },
};

export default nextConfig;
