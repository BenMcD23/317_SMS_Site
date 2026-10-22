import { describe, expect, it } from "vitest";

import {
  buildBadgeName,
  gainedWhereLabel,
  needsGainedWhere,
  parseBadgeName,
  type BadgeCategory,
} from "@/lib/reference";

const CORE: BadgeCategory = { id: "core", name: "Core", items: ["Squadron", "Wing"] };
const LEVELLED: BadgeCategory = {
  id: "leadership",
  name: "Leadership",
  prefix: "Leadership",
  levels: ["Blue", "Bronze"],
};
const SUBTYPED: BadgeCategory = {
  id: "musician",
  name: "Music",
  subTypes: ["Drums", "Bugle"],
  levels: ["Blue", "Gold"],
};
const CATEGORIES = [CORE, LEVELLED, SUBTYPED];

describe("buildBadgeName", () => {
  it("builds each kind of name", () => {
    expect(buildBadgeName(CORE, "Wing", null)).toBe("Wing");
    expect(buildBadgeName(LEVELLED, null, "Bronze")).toBe("Leadership – Bronze");
    expect(buildBadgeName(SUBTYPED, "Drums", "Gold")).toBe("Drums – Gold");
  });

  it("is null until the choice is complete", () => {
    expect(buildBadgeName(CORE, null, null)).toBeNull();
    expect(buildBadgeName(LEVELLED, null, null)).toBeNull();
    expect(buildBadgeName(SUBTYPED, "Drums", null)).toBeNull();
    expect(buildBadgeName(SUBTYPED, null, "Gold")).toBeNull();
    expect(buildBadgeName({ id: "x", name: "X" }, "a", "b")).toBeNull();
  });
});

describe("parseBadgeName", () => {
  it("round-trips every name buildBadgeName can make", () => {
    for (const [cat, sub, level] of [
      [CORE, "Squadron", null],
      [LEVELLED, null, "Blue"],
      [SUBTYPED, "Bugle", "Blue"],
    ] as const) {
      const name = buildBadgeName(cat, sub, level)!;
      expect(parseBadgeName(CATEGORIES, name)).toEqual({ category: cat, subType: sub, level });
    }
  });

  it("returns nothing for unknown names, unknown levels or a plain hyphen", () => {
    const none = { category: null, subType: null, level: null };
    expect(parseBadgeName(CATEGORIES, "Made Up")).toEqual(none);
    expect(parseBadgeName(CATEGORIES, "Leadership – Platinum")).toEqual(none);
    expect(parseBadgeName(CATEGORIES, "Leadership - Blue")).toEqual(none); // hyphen, not en dash
    expect(parseBadgeName([], "Wing")).toEqual(none);
  });
});

describe("gained-where", () => {
  const options = [
    { value: "camp", label: "Camp" },
    { value: "on_sqn", label: "On squadron" },
  ];

  it("labels a stored value", () => {
    expect(gainedWhereLabel(options, "on_sqn")).toBe("On squadron");
    expect(gainedWhereLabel(options, "elsewhere")).toBeNull();
    expect(gainedWhereLabel(options, null)).toBeNull();
  });

  it("is never asked for replacements or exempt categories", () => {
    const exempt = new Set(["core"]);
    expect(needsGainedWhere(exempt, "leadership", false)).toBe(true);
    expect(needsGainedWhere(exempt, "leadership", true)).toBe(false);
    expect(needsGainedWhere(exempt, "core", false)).toBe(false);
    expect(needsGainedWhere(exempt, null, false)).toBe(true);
  });
});
