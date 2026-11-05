import { describe, expect, it } from "vitest";

import {
  cadetInitials,
  classificationBadgeClass,
  compareFlights,
  flightBadgeClass,
  flightIndex,
  flightLabel,
  flightsIn,
  sortFlights,
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

// Flights are whatever the scraper brings in, so none of this may assume A–C.
describe("flights follow the roster, not a fixed list", () => {
  it.each([
    ["A", 0],
    ["a", 0],
    [" D ", 3],
    ["Alpha", 0],
    ["Delta", 3],
    ["E Flight", 4],
    ["Foxtrot", 5],
    ["NCO", -1],
    ["Unknown", -1],
    ["", -1],
    ["AB", -1],
  ])("flightIndex(%j) is %i", (flight, expected) => {
    expect(flightIndex(flight)).toBe(expected);
  });

  it("flightIndex tolerates null and undefined (a cadet with no flight)", () => {
    expect(flightIndex(null)).toBe(-1);
    expect(flightIndex(undefined)).toBe(-1);
  });

  it("orders NCO first, then lettered flights alphabetically, then anything else", () => {
    expect(sortFlights(["C", "NCO", "Zulu", "A", "E", "B", "D"])).toEqual([
      "NCO",
      "A",
      "B",
      "C",
      "D",
      "E",
      "Zulu",
    ]);
  });

  it("works for a squadron with two flights, or one, or none", () => {
    expect(flightsIn([{ flight: "B" }, { flight: "A" }])).toEqual(["A", "B"]);
    expect(flightsIn([{ flight: "A" }])).toEqual(["A"]);
    expect(flightsIn([{ flight: null }])).toEqual([]);
  });

  it("picks up a new D flight without any change", () => {
    const roster = ["A", "B", "C", "D"].map((flight) => ({ flight }));
    expect(flightsIn(roster)).toEqual(["A", "B", "C", "D"]);
  });

  it("puts an unnamed-letter flight after the lettered ones even when it sorts earlier as text", () => {
    // "2nd" < "A" as text; it is still not a lettered flight.
    expect(sortFlights(["2nd", "A"])).toEqual(["A", "2nd"]);
  });

  it("compareFlights is consistent: equal flights tie, and order is antisymmetric", () => {
    expect(compareFlights("B", "B")).toBe(0);
    expect(Math.sign(compareFlights("A", "B"))).toBe(-Math.sign(compareFlights("B", "A")));
    expect(Math.sign(compareFlights("NCO", "A"))).toBe(-1);
  });

  it("gives every lettered flight a flight look, cycling after four", () => {
    const looks = ["A", "B", "C", "D"].map(flightBadgeClass);
    expect(new Set(looks).size).toBe(4);
    expect(flightBadgeClass("E")).toBe(flightBadgeClass("A"));
    expect(flightBadgeClass("E")).not.toBe(flightBadgeClass(null));
  });
});
