import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import nextConfig from "@/next.config";

// The shared components (@317/ui-common) ship as TypeScript source in
// node_modules. Two lines of config make them work, and losing either fails
// quietly: without transpilePackages the build can't compile them, and
// without the @source line Tailwind skips node_modules, so they render
// unstyled with no error anywhere.
const root = resolve(import.meta.dirname, "..");

describe("the shared components package", () => {
  it("is compiled by Next like our own code", () => {
    expect(nextConfig.transpilePackages).toContain("@317/ui-common");
  });

  it("is scanned by Tailwind, from a path that holds its components", () => {
    const css = readFileSync(join(root, "app/globals.css"), "utf8");
    const source = css.match(/@source\s+"([^"]*@317\/ui-common[^"]*)"/)?.[1];
    expect(source, "app/globals.css has no @source for @317/ui-common").toBeDefined();
    const dir = resolve(root, "app", source!);
    expect(existsSync(join(dir, "components/ui/button.tsx"))).toBe(true);
  });

  it("is installed from a pinned GitHub release, not a local path", () => {
    // A file: or ../ dependency works on one machine and fails in Docker and CI.
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.dependencies["@317/ui-common"]).toMatch(
      /^https:\/\/github\.com\/BenMcD23\/317-UI-Common\/releases\/download\/v\d+\.\d+\.\d+\/317-ui-common-\d+\.\d+\.\d+\.tgz$/
    );
  });

  it("left no local copy of a shared file behind", () => {
    // A stale copy would quietly shadow nothing, but invites edits that never ship.
    const shared = readdirSync(join(root, "node_modules/@317/ui-common/src/components/ui"));
    for (const file of shared) expect(existsSync(join(root, "components/ui", file)), file).toBe(false);
    expect(existsSync(join(root, "lib/utils.ts"))).toBe(false);
  });
});
