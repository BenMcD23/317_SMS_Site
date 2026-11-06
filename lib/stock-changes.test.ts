import { describe, expect, it } from "vitest";

import { signedChange, stockActionLabel } from "@/lib/stock-changes";

describe("signedChange", () => {
  it("signs a change, with a real minus sign", () => {
    expect(signedChange(3)).toBe("+3");
    expect(signedChange(-2)).toBe("−2");
  });

  it("is empty for a change that moved nothing (a move or rename)", () => {
    expect(signedChange(0)).toBe("");
  });
});

describe("stockActionLabel", () => {
  it("names each action in plain English", () => {
    expect(stockActionLabel("taken")).toBe("Taken for an order");
    expect(stockActionLabel("topped_up")).toBe("Topped up");
  });

  it("shows an action the site doesn't know yet as it came, rather than blank", () => {
    expect(stockActionLabel("recounted_by_robot")).toBe("recounted_by_robot");
  });
});
