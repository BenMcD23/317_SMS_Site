import { defineConfig } from "vitest/config";

// Tests run in Node by default (route handlers, lib/ logic); component tests
// opt into a DOM with a `// @vitest-environment jsdom` comment on line 1.
export default defineConfig({
  resolve: {
    alias: { "@": import.meta.dirname },
  },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
    setupFiles: ["./vitest.setup.ts"],
    // Every test starts from real modules, env and globals — a mock or stub
    // left behind by one test must never decide another's outcome.
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      include: ["lib/**", "components/**", "hooks/**", "app/**", "auth*.ts", "proxy.ts"],
      exclude: ["components/ui/**", "**/*.test.*"],
    },
  },
});
