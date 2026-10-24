import { describe, expect, it } from "vitest";

import { STATUS_LABEL, STATUS_TONE, cellLabel, shiftWeek, type WeekStatus } from "@/lib/activity-logs";

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

describe("cellLabel", () => {
  it("reads a week of the grid out in words, minutes included", () => {
    expect(
      cellLabel("2026-10-12", {
        skills: { state: "done", minutes: 75 },
        volunteering: { state: "short", minutes: 20 },
        physical: { state: "missed", minutes: 0 },
      })
    ).toBe("Week of 12 Oct: Skills done, 75 min, Volunteering 20 min, under an hour, Physical missed");
    expect(
      cellLabel("2026-10-19", {
        skills: { state: "due", minutes: 0 },
        volunteering: { state: "off", minutes: 0 },
        physical: { state: "off", minutes: 0 },
      })
    ).toBe("Week of 19 Oct: Skills not logged yet, Volunteering nothing due, Physical nothing due");
  });
});
