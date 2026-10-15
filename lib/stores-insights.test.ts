import { describe, expect, it } from "vitest";

import { type InsightLine, monthsLabel, orderCsvRows, sizeLabel, STATUS_LABELS } from "@/lib/stores-insights";

function line(over: Partial<InsightLine> = {}): InsightLine {
  return {
    itemType: "Beret",
    size: "56",
    requested: 6,
    given: 4,
    waiting: 2,
    inStock: 1,
    monthlyRate: 0.5,
    toOrder: 3,
    status: "short",
    lastRequested: null,
    ...over,
  };
}

describe("stores insights wording", () => {
  it("a one-size item reads as 'One size', not a blank", () => {
    expect(sizeLabel("")).toBe("One size");
    expect(sizeLabel("56")).toBe("56");
  });

  it("one month is singular", () => {
    expect(monthsLabel(1)).toBe("1 month");
    expect(monthsLabel(12)).toBe("12 months");
  });

  it("every status has its own label", () => {
    expect(new Set(Object.values(STATUS_LABELS)).size).toBe(6);
  });

  it("the order CSV says what to order, of what, and why", () => {
    expect(orderCsvRows([line(), line({ itemType: "Belt", size: "", status: "low", waiting: 0 })])).toEqual([
      {
        Item: "Beret",
        Size: "56",
        Order: 3,
        "On shelf": 1,
        "Cadets waiting": 2,
        "Asked for": 6,
        Why: "Cadets waiting",
      },
      {
        Item: "Belt",
        Size: "One size",
        Order: 3,
        "On shelf": 1,
        "Cadets waiting": 0,
        "Asked for": 6,
        Why: "Running low",
      },
    ]);
  });

  it("an empty order list is an empty CSV, not an error", () => {
    expect(orderCsvRows([])).toEqual([]);
  });
});
