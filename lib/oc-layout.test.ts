import { describe, expect, it } from "vitest";

import { moveSection, normaliseLayout, OC_SECTIONS } from "@/lib/oc-layout";

describe("normaliseLayout", () => {
  it("keeps a full saved order as it is", () => {
    const order = ["pipeline", "qualifications", "strength", "committee"];
    expect(normaliseLayout(order)).toEqual(order);
  });

  it("adds sections missing from the saved order at the bottom, in their default order", () => {
    expect(normaliseLayout(["qualifications"])).toEqual([
      "qualifications",
      "committee",
      "strength",
      "pipeline",
    ]);
  });

  it("drops ids it doesn't know and repeats, so every section shows exactly once", () => {
    expect(normaliseLayout(["pipeline", "subs-radar", "pipeline", 7, null])).toEqual([
      "pipeline",
      "committee",
      "strength",
      "qualifications",
    ]);
  });

  it("falls back to the default order when the API sent something that isn't a list", () => {
    expect(normaliseLayout(undefined)).toEqual([...OC_SECTIONS]);
    expect(normaliseLayout({ detail: "OC access required" })).toEqual([...OC_SECTIONS]);
  });
});

describe("moveSection", () => {
  const order = [...OC_SECTIONS];

  it("moves a section up or down one place", () => {
    expect(moveSection(order, "strength", -1)).toEqual([
      "strength",
      "committee",
      "qualifications",
      "pipeline",
    ]);
    expect(moveSection(order, "strength", 1)).toEqual([
      "committee",
      "qualifications",
      "strength",
      "pipeline",
    ]);
  });

  it("leaves the order alone at either end", () => {
    expect(moveSection(order, "committee", -1)).toBe(order);
    expect(moveSection(order, "pipeline", 1)).toBe(order);
  });
});
