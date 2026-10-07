import { describe, expect, it } from "vitest";
import { completeOrderBlockers } from "@/lib/badge-orders";

const given = { givenAt: "2026-10-01T18:00:00" };

describe("completeOrderBlockers", () => {
  it("lets an order complete once every badge has been given", () => {
    expect(completeOrderBlockers({ items: [given, given] })).toEqual([]);
  });

  it("blocks while a badge is still ungiven, even if it was never marked received", () => {
    expect(completeOrderBlockers({ items: [given, { givenAt: null }] })).toEqual(["1 badge not yet given"]);
  });

  it("pluralises the count", () => {
    expect(completeOrderBlockers({ items: [{}, { givenAt: null }] })).toEqual(["2 badges not yet given"]);
  });

  it("treats an order with no items as completable", () => {
    expect(completeOrderBlockers({ items: [] })).toEqual([]);
  });
});
