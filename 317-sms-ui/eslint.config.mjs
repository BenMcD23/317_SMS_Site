import { createRequire } from "node:module";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// eslint-plugin-react (7.37.5, the latest, vendored inside eslint-config-next)
// declares no ESLint 10 support and auto-detects the React version by calling
// `context.getFilename()`, which ESLint 10 removed — every rule from that plugin
// then throws and the whole lint run dies. Naming the version outright skips the
// detection, so it never reaches the removed API. Read from package.json rather
// than hardcoded, so a React bump can't leave the linter checking the wrong
// version's rules. Drop all of this once the plugin supports ESLint 10.
const require = createRequire(import.meta.url);
const { dependencies } = require("./package.json");

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: { react: { version: dependencies.react } },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
