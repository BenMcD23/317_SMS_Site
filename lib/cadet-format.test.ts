import { describe, expect, it } from "vitest";

import {
  cadetInitials,
  classificationBadgeClass,
  flightBadgeClass,
  flightLabel,
  flightsIn,
} from "@/lib/cadet-format";

describe("flightBadgeClass", () => {
  it("colours each flight, whether stored as a letter or a name", () => {
    expect(flightBadgeClass("A")).toContain("chart-1");
    expect(flightBadgeClass("Alpha")).toBe(flightBadgeClass("A"));
    expect(flightBadgeClass("B")).toContain("chart-5");
    expect(flightBadgeClass("C")).toContain("chart-3");
    expect(flightBadgeClass(" C ")).toBe(flightBadgeClass("C"));
  });

  // A flight is a team, not a state: red B Flight read as an error.
  it.each(["A", "B", "C", "D"])("never paints %s Flight in a status colour", (flight) => {
    expect(flightBadgeClass(flight)).not.toMatch(/destructive|success|warning/);
  });

  it("falls back to muted for no or unknown flight", () => {
    const muted = flightBadgeClass(null);
    expect(muted).toContain("muted");
    expect(flightBadgeClass(undefined)).toBe(muted);
    expect(flightBadgeClass("")).toBe(muted);
    expect(flightBadgeClass("NCO")).toBe(muted);
  });
});

describe("classificationBadgeClass", () => {
  it("treats a missing classification as Junior", () => {
    expect(classificationBadgeClass(null)).toBe(classificationBadgeClass("Junior Cadet"));
    expect(classificationBadgeClass("Leading Cadet")).toContain("primary");
    expect(classificationBadgeClass("Something new")).toContain("muted");
  });

  it("deepens towards Master Air Cadet without ever using the error red", () => {
    expect(classificationBadgeClass("Master Air Cadet")).toContain("bg-primary ");
    for (const c of ["First Class Cadet", "Leading Cadet", "Senior Cadet", "Master Air Cadet"]) {
      expect(classificationBadgeClass(c)).not.toMatch(/destructive|success|warning/);
    }
  });
});

describe("cadetInitials", () => {
  it.each([
    ["amy", "able", "AA"],
    ["Amy", null, "A"],
    [null, "Able", "A"],
    [null, null, "?"],
    ["", "", "?"],
  ])("%s %s -> %s", (first, last, expected) => {
    expect(cadetInitials(first, last)).toBe(expected);
  });
});

describe("flightsIn", () => {
  it("lists each flight once, in squadron order, ignoring cadets with none", () => {
    const roster = [{ flight: "C" }, { flight: "A" }, { flight: null }, { flight: "NCO" }, { flight: " A " }];
    expect(flightsIn(roster)).toEqual(["NCO", "A", "C"]);
  });

  it("keeps a flight it doesn't know about, after the known ones", () => {
    expect(flightsIn([{ flight: "Zulu" }, { flight: "B" }])).toEqual(["B", "Zulu"]);
  });

  it("is empty for an empty roster", () => {
    expect(flightsIn([])).toEqual([]);
  });
});

describe("flightLabel", () => {
  it("spells out a stored letter but leaves a full name alone", () => {
    expect(flightLabel("A")).toBe("A Flight");
    expect(flightLabel("NCO")).toBe("NCO Flight");
    expect(flightLabel("B Flight")).toBe("B Flight");
  });
});
