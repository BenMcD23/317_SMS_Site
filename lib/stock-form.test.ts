import { describe, expect, it } from "vitest";

import { stockPayload, stockSchema, suggestLocation, type StockForm } from "@/lib/stock-form";
import type { StockItem } from "@/lib/stores-types";

const NO_SIZE = new Set(["Lanyard"]);
const line = (over: Partial<StockForm> = {}): StockForm => ({
  itemType: "Beret",
  size: "55",
  quantity: 1,
  box: "A",
  section: "1",
  ...over,
});
const item = (over: Partial<StockItem>) =>
  ({ id: "x", itemType: "Beret", size: "55", quantity: 1, box: "A", section: "1", ...over }) as StockItem;

describe("stockSchema", () => {
  it("accepts a complete line", () => {
    expect(stockSchema(NO_SIZE, 1).safeParse(line()).success).toBe(true);
  });

  it("needs a size for sized items only, and whitespace isn't a size", () => {
    expect(stockSchema(NO_SIZE, 1).safeParse(line({ size: "   " })).success).toBe(false);
    expect(stockSchema(NO_SIZE, 1).safeParse(line({ itemType: "Lanyard", size: "" })).success).toBe(true);
  });

  // Adding nothing is a mistake; counting a line down to zero is a stock take.
  it("needs at least one item to add, but lets an edit go to zero", () => {
    expect(stockSchema(NO_SIZE, 1).safeParse(line({ quantity: 0 })).success).toBe(false);
    expect(stockSchema(NO_SIZE, 0).safeParse(line({ quantity: 0 })).success).toBe(true);
    expect(stockSchema(NO_SIZE, 0).safeParse(line({ quantity: -1 })).success).toBe(false);
  });

  it("rejects a cleared number field and part items", () => {
    expect(stockSchema(NO_SIZE, 1).safeParse(line({ quantity: NaN })).success).toBe(false);
    expect(stockSchema(NO_SIZE, 1).safeParse(line({ quantity: 1.5 })).success).toBe(false);
  });

  it("needs a box and a section", () => {
    expect(stockSchema(NO_SIZE, 1).safeParse(line({ box: "" })).success).toBe(false);
    expect(stockSchema(NO_SIZE, 1).safeParse(line({ section: "" })).success).toBe(false);
  });
});

describe("stockPayload", () => {
  it("trims sizes so they can't make near-duplicate rows", () => {
    expect(stockPayload(line({ size: "  57 (old pattern) " }), NO_SIZE).size).toBe("57 (old pattern)");
  });

  it("stores unsized items as N/A whatever the field holds", () => {
    expect(stockPayload(line({ itemType: "Lanyard", size: "55" }), NO_SIZE).size).toBe("N/A");
  });
});

describe("suggestLocation", () => {
  it("puts new stock with the same item and size first", () => {
    const stock = [
      item({ box: "B", section: "3", quantity: 9, size: "56" }),
      item({ box: "A", section: "2" }),
    ];
    expect(suggestLocation(stock, "Beret", "55")).toEqual({ box: "A", section: "2", source: "exact" });
  });

  it("otherwise goes where most of that item lives", () => {
    const stock = [
      item({ size: "54", box: "A", section: "1", quantity: 1 }),
      item({ size: "56", box: "B", section: "2", quantity: 4 }),
    ];
    expect(suggestLocation(stock, "Beret", "57")).toEqual({ box: "B", section: "2", source: "co-location" });
  });

  it("suggests nothing for an item the stores have never held", () => {
    expect(suggestLocation([item({})], "Jumper", "M")).toBeNull();
    expect(suggestLocation([], "Beret", "55")).toBeNull();
  });
});
