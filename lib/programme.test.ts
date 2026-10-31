import { describe, expect, it } from "vitest";

import {
  importSummary,
  kindsByTurnout,
  monthLabel,
  overallRate,
  sessionLines,
  type ProgrammeCategory,
  type ProgrammeNightTurnout,
} from "@/lib/programme";

const night = (present: number, total: number): ProgrammeNightTurnout => ({
  date: "2026-10-07",
  rate: total ? (100 * present) / total : null,
  present,
  total,
  uniform: null,
  sessions: [],
});

const kind = (key: string, label: string, rate: number | null): ProgrammeCategory => ({
  key,
  label,
  rate,
  nights: 1,
  authorised_rate: 0,
  cadet_nights: 10,
});

describe("overallRate", () => {
  it("weights each night by who was registered, not night by night", () => {
    // 9 of 10 and 1 of 2 is 10 of 12, not the average of 90% and 50%.
    expect(overallRate([night(9, 10), night(1, 2)])).toBe(83.3);
  });

  it("is null with nobody registered", () => {
    expect(overallRate([])).toBeNull();
    expect(overallRate([night(0, 0)])).toBeNull();
  });
});

describe("kindsByTurnout", () => {
  it("puts the lowest turnout first and drops kinds with no figure", () => {
    const sorted = kindsByTurnout([
      kind("sport", "Sport", 90),
      kind("drill", "Drill", 60),
      kind("x", "X", null),
    ]);
    expect(sorted.map((k) => k.key)).toEqual(["drill", "sport"]);
  });

  it("orders equal turnout by name so the chart doesn't shuffle", () => {
    expect(kindsByTurnout([kind("b", "Band", 70), kind("a", "Admin", 70)]).map((k) => k.label)).toEqual([
      "Admin",
      "Band",
    ]);
  });
});

describe("sessionLines", () => {
  it("names the period and flights, and the whole squadron as All", () => {
    expect(
      sessionLines([
        { period: 1, flights: "A, B", activity: "Drill", category: "drill" },
        { period: 2, flights: "C, A, B", activity: "Halloween", category: "social" },
      ])
    ).toEqual(["1st · A, B · Drill", "2nd · All · Halloween"]);
  });
});

describe("monthLabel and importSummary", () => {
  it("reads a month and an import's outcome", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(monthLabel("junk")).toBe("junk");
    expect(importSummary({ month: "2026-10", nights: 1, sessions: 9 })).toBe(
      "October 2026: 1 night, 9 sessions"
    );
    expect(importSummary({ month: "2026-02", nights: 0, sessions: 0, skipped: "no nights in the doc" })).toBe(
      "February 2026: not imported (no nights in the doc)"
    );
  });
});
