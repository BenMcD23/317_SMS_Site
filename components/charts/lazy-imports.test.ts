// Recharts is about 110 KB gzipped. Pages load it through
// `components/charts/lazy.tsx`, after they are on screen; one direct import
// anywhere puts it back into that page's first download. These checks keep it
// out.
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/** The modules that draw with Recharts. Only `lazy.tsx` may import them. */
const CHART_MODULES = [
  "components/charts/trend-bar-chart.tsx",
  "components/charts/score-trend-chart.tsx",
  "components/oc/custom-dashboard/panel-chart.tsx",
  "components/assistant/answer-chart.tsx",
  "components/stats/charts.tsx",
  "components/stats/programme-turnout.tsx",
  "components/stats/targets.tsx",
];
const LAZY = "components/charts/lazy.tsx";

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const FILES = [...sources("app"), ...sources("components"), ...sources("lib"), ...sources("hooks")];

/** Every import statement in a file with what it names and where from. */
function imports(source: string) {
  return [...source.matchAll(/import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g)].map((m) => ({
    what: m[1],
    from: m[2],
  }));
}

// `import type { X }` and `import { type X }` vanish at build time, so they
// don't pull the module into the bundle.
function typeOnly(what: string) {
  if (/^type\s/.test(what)) return true;
  const named = what.match(/^\{([\s\S]*)\}$/);
  return !!named && named[1].split(",").every((n) => !n.trim() || /^type\s/.test(n.trim()));
}

describe("charts load lazily", () => {
  it("finds the source files and the chart modules", () => {
    expect(FILES.length).toBeGreaterThan(100);
    for (const m of CHART_MODULES) expect(fs.existsSync(m), m).toBe(true);
  });

  it("only the chart modules import recharts", () => {
    const offenders = FILES.filter((f) => !CHART_MODULES.includes(f)).filter((f) =>
      imports(fs.readFileSync(f, "utf8")).some((i) => i.from === "recharts")
    );
    // Draw the chart in its own module, add it to CHART_MODULES and lazy.tsx.
    expect(offenders).toEqual([]);
  });

  it("only lazy.tsx imports a chart module", () => {
    const aliases = CHART_MODULES.map((m) => "@/" + m.replace(/\.tsx$/, ""));
    const offenders = FILES.filter((f) => f !== LAZY).filter((f) =>
      imports(fs.readFileSync(f, "utf8")).some((i) => aliases.includes(i.from) && !typeOnly(i.what))
    );
    // Import the chart from "@/components/charts/lazy" instead.
    expect(offenders).toEqual([]);
  });

  it("knows a type-only import from one that loads the module", () => {
    expect(typeOnly("type { DrillDown }")).toBe(true);
    expect(typeOnly("{ type DrillDown }")).toBe(true);
    expect(typeOnly("{ type DrillDown, StackTooltip }")).toBe(false);
    expect(typeOnly("{ StrengthChart }")).toBe(false);
  });
});
