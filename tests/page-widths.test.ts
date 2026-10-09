// Every page sits in one of three widths, so moving between pages doesn't make
// the content jump about. Pick by what the page is (see CLAUDE.md "Page widths"):
//   max-w-3xl  one form or document, read top to bottom
//   max-w-5xl  lists, tables, records, multi-column forms — the default
//   max-w-6xl  dashboards and charts
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ALLOWED = new Set(["max-w-3xl", "max-w-5xl", "max-w-6xl"]);
// Pages with no app shell around them, which centre their own card.
const BARE = new Set(["app/login/page.tsx", "app/unauthorized/page.tsx"]);

function pages(dir = "app"): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return pages(p);
    return e.name === "page.tsx" ? [p] : [];
  });
}

/** The max-w of every centred, full-width wrapper in a file: the page frame. */
function frameWidths(source: string): string[] {
  return [...source.matchAll(/className="([^"]*)"/g)]
    .map((m) => m[1].split(/\s+/))
    .filter((cls) => cls.includes("mx-auto") && cls.some((c) => c.startsWith("max-w-")))
    .map((cls) => cls.find((c) => c.startsWith("max-w-"))!);
}

const ALL = pages().filter((p) => !BARE.has(p));

describe("page widths", () => {
  it("finds the pages", () => {
    expect(ALL.length).toBeGreaterThan(40);
  });

  it.each(ALL)("%s uses one of the three page widths", (file) => {
    const widths = frameWidths(fs.readFileSync(file, "utf8"));
    expect(
      widths.length,
      `${file} has no centred max-w wrapper — it would stretch edge to edge`
    ).toBeGreaterThan(0);
    for (const w of widths) expect(ALLOWED, `${file} uses ${w}`).toContain(w);
  });
});
