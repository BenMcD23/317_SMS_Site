import { describe, expect, it } from "vitest";

import {
  addCounts,
  countStates,
  EMPTY_COUNTS,
  rateExcludingAuthorised,
  rateOf,
  STATE_BADGE,
  STATE_LABEL,
  STATE_LETTER,
  totalOf,
} from "@/lib/attendance";

describe("attendance tallies", () => {
  it("counts each state", () => {
    expect(countStates(["present", "present", "absent", "authorised"])).toEqual({
      present: 2,
      authorised: 1,
      absent: 1,
    });
    expect(countStates([])).toEqual(EMPTY_COUNTS);
  });

  it("never mutates the shared empty counts", () => {
    countStates(["present"]);
    expect(EMPTY_COUNTS).toEqual({ present: 0, authorised: 0, absent: 0 });
  });

  it("adds and totals", () => {
    const sum = addCounts({ present: 1, authorised: 2, absent: 3 }, { present: 4, authorised: 0, absent: 1 });
    expect(sum).toEqual({ present: 5, authorised: 2, absent: 4 });
    expect(totalOf(sum)).toBe(11);
  });

  it("rates are whole percentages and null with nothing to divide by", () => {
    expect(rateOf({ present: 2, authorised: 1, absent: 0 })).toBe(67);
    expect(rateOf(EMPTY_COUNTS)).toBeNull();
    // Excused absences drop out of the fairer rate entirely.
    expect(rateExcludingAuthorised({ present: 2, authorised: 5, absent: 2 })).toBe(50);
    expect(rateExcludingAuthorised({ present: 0, authorised: 3, absent: 0 })).toBeNull();
  });

  it("has a label, badge and letter for every state", () => {
    for (const state of ["present", "authorised", "absent"] as const) {
      expect(STATE_LABEL[state]).toBeTruthy();
      expect(STATE_BADGE[state]).toBeTruthy();
      expect(STATE_LETTER[state]).toHaveLength(1);
    }
  });
});
