import { describe, expect, it } from "vitest";

import { orderStatsPath, percent } from "@/lib/order-stats";

describe("orderStatsPath", () => {
  it("adds the day count for a window", () => {
    expect(orderStatsPath("/stores/orders/stats", "3m")).toBe("/stores/orders/stats?days=91");
  });

  it("omits the filter for all time", () => {
    expect(orderStatsPath("/stores/orders/stats", "all")).toBe("/stores/orders/stats");
  });

  it("treats an unknown window as all time rather than sending junk", () => {
    expect(orderStatsPath("/stores/orders/stats", "bogus")).toBe("/stores/orders/stats");
  });
});

describe("percent", () => {
  it("rounds to a whole number", () => {
    expect(percent(1, 3)).toBe(33);
  });

  it("is 0 when there is nothing to divide by", () => {
    expect(percent(0, 0)).toBe(0);
  });
});
