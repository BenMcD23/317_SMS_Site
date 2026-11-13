// Colour comes from the theme's tokens (text-warning, bg-primary/10), never a
// Tailwind palette literal (text-amber-800): a literal is picked for one theme
// and goes unreadable in the other, and a status colour on a category makes a
// flight or an assessment type look like a failure. See CLAUDE.md "Look".
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const LITERAL =
  /\b(?:text|bg|border|ring|fill|stroke|from|to|via|outline|decoration)-(?:red|green|blue|amber|orange|yellow|violet|purple|emerald|sky|rose|slate|gray|zinc|neutral|stone|lime|teal|cyan|indigo|fuchsia|pink)-\d{2,3}\b/g;

// The generated shadcn parts, and the JI/AO document preview, which mimics a
// printed form on white paper whatever the theme.
const EXEMPT = [/^components\/ui\//, /document-preview\.tsx$/];

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : sources(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const FILES = ["app", "components", "lib"]
  .flatMap((d) => sources(d))
  .filter((f) => !EXEMPT.some((re) => re.test(f.split(path.sep).join("/"))));

describe("colour tokens", () => {
  it("finds the source files", () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("no component uses a palette colour literal", () => {
    const offenders = FILES.flatMap((f) =>
      [...fs.readFileSync(f, "utf8").matchAll(LITERAL)].map((m) => `${f}: ${m[0]}`)
    );
    expect(offenders).toEqual([]);
  });
});
