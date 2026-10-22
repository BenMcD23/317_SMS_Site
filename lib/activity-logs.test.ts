import { describe, expect, it } from "vitest";

import { STATUS_LABEL, STATUS_TONE, shiftWeek, type WeekStatus } from "@/lib/activity-logs";

describe("shiftWeek", () => {
  it("steps whole weeks across months, years and the clocks changing", () => {
    expect(shiftWeek("2026-10-19", -1)).toBe("2026-10-12");
    expect(shiftWeek("2026-10-19", 2)).toBe("2026-11-02");
    expect(shiftWeek("2026-12-28", 1)).toBe("2027-01-04");
    // The clocks go back on 25 Oct 2026; local dates mustn't slip a day.
    expect(shiftWeek("2026-10-19", 1)).toBe("2026-10-26");
    expect(shiftWeek("2026-03-23", 1)).toBe("2026-03-30");
  });
});

describe("status words", () => {
  const all: WeekStatus[] = ["done", "some", "none", "not_set_up", "not_started", "complete"];

  it("every status has a label, so a badge never shows a raw key", () => {
    for (const s of all) expect(STATUS_LABEL[s]).toMatch(/^[A-Z][a-z ]+$/);
  });

  it("only a section with nothing logged reads as the alarming colour", () => {
    expect(all.filter((s) => STATUS_TONE[s] === "destructive")).toEqual(["none"]);
  });
});
