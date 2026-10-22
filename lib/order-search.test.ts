import { describe, expect, it } from "vitest";

import { searchOrders } from "@/lib/order-search";

type Item = { id: string; itemType: string };
const order = (id: string, cadetName: string, ...types: string[]) => ({
  id,
  cadetName,
  items: types.map((itemType, i): Item => ({ id: `${id}-${i}`, itemType })),
});

const ORDERS = [
  order("1", "Alex Smith", "Beret", "Tie", "Belt"),
  order("2", "Bella Jones", "Jumper"),
  order("3", "Chris Brown", "Beret"),
];
const byType = (i: Item) => i.itemType;
const ids = (results: ReturnType<typeof searchOrders<(typeof ORDERS)[number]>>) =>
  results.map((r) => [r.order.id, r.items.map((i) => i.itemType), r.itemFiltered]);

describe("searchOrders", () => {
  it("an empty or blank query keeps every order with every item", () => {
    expect(ids(searchOrders(ORDERS, "", byType))).toEqual([
      ["1", ["Beret", "Tie", "Belt"], false],
      ["2", ["Jumper"], false],
      ["3", ["Beret"], false],
    ]);
    expect(searchOrders(ORDERS, "   ", byType)).toHaveLength(3);
  });

  it("a cadet name match keeps the whole order", () => {
    expect(ids(searchOrders(ORDERS, "smith", byType))).toEqual([["1", ["Beret", "Tie", "Belt"], false]]);
  });

  it("an item match keeps only the matching items, flagged as a subset", () => {
    expect(ids(searchOrders(ORDERS, "beret", byType))).toEqual([
      ["1", ["Beret"], true],
      // Chris's order is only a beret — nothing hidden, so it isn't flagged.
      ["3", ["Beret"], false],
    ]);
  });

  it("matches are case-insensitive and ignore surrounding spaces", () => {
    expect(ids(searchOrders(ORDERS, "  TIE ", byType))).toEqual([["1", ["Tie"], true]]);
  });

  it("a query matching one cadet's name and another's items treats each order on its own terms", () => {
    // "bel" is Bella's name and Alex's Belt.
    expect(ids(searchOrders(ORDERS, "bel", byType))).toEqual([
      ["1", ["Belt"], true],
      ["2", ["Jumper"], false],
    ]);
  });

  it("nothing matching returns no orders", () => {
    expect(searchOrders(ORDERS, "wedgewood", byType)).toEqual([]);
  });

  it("orders with no items or missing names don't throw", () => {
    const odd = [
      { id: "x", cadetName: null as unknown as string, items: [] as Item[] },
      { id: "y", cadetName: "Dee", items: [{ id: "y-0", itemType: null as unknown as string }] },
    ];
    expect(searchOrders(odd, "beret", byType)).toEqual([]);
    expect(searchOrders(odd, "dee", byType).map((r) => r.order.id)).toEqual(["y"]);
  });

  it("keeps the order it was given", () => {
    expect(searchOrders([...ORDERS].reverse(), "beret", byType).map((r) => r.order.id)).toEqual(["3", "1"]);
  });
});
