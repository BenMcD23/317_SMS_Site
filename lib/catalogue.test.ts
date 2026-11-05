import { afterEach, describe, expect, it, vi } from "vitest";

import {
  badgeNames,
  badgePayload,
  badgeSchema,
  badgeSummary,
  type CatalogueBadge,
  type CatalogueItem,
  deleteItem,
  EMPTY_BADGE,
  EMPTY_ITEM,
  itemPayload,
  itemSchema,
  itemSummary,
  itemToForm,
  moved,
  OWN_LINE,
  parseList,
  saveBadge,
  saveItem,
} from "@/lib/catalogue";

const ITEM: CatalogueItem = {
  id: 7,
  name: "Beret",
  gender: "unisex",
  issuanceCategory: null,
  noSize: false,
  kitFlight: true,
  onOrderList: false,
  lowStockLevel: 4,
  sizes: ["54", "56"],
  sizingFields: ["chest"],
  active: true,
  stockRows: 2,
  orderItems: 5,
};

const BADGE: CatalogueBadge = {
  id: 3,
  slug: "music",
  name: "Music Badges",
  kind: "levels",
  prefix: "Music",
  levels: ["Blue", "Gold"],
  items: [],
  gainedWhere: true,
  active: true,
  inUse: 0,
};

afterEach(() => vi.unstubAllGlobals());

describe("parseList", () => {
  it("splits lines and commas, trims, drops blanks and repeats, keeps the typed order", () => {
    expect(parseList(" 56 \n\n54, 56\n  58  ")).toEqual(["56", "54", "58"]);
  });

  it("collapses inner whitespace and keeps non-ASCII text", () => {
    expect(parseList("Grand   ½\nÉcharpe")).toEqual(["Grand ½", "Écharpe"]);
  });

  it("is empty for blank input", () => {
    expect(parseList("")).toEqual([]);
    expect(parseList(" \n , \n")).toEqual([]);
  });
});

describe("the item form", () => {
  const ok = { ...EMPTY_ITEM, name: "Fleece", sizes: "S\nM" };

  it("accepts a sized item with sizes and a sizeless one without", () => {
    expect(itemSchema.safeParse(ok).success).toBe(true);
    expect(itemSchema.safeParse({ ...EMPTY_ITEM, name: "Lanyard", noSize: true }).success).toBe(true);
  });

  it("asks for sizes on a sized item, and says what to do", () => {
    const res = itemSchema.safeParse({ ...EMPTY_ITEM, name: "Fleece" });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0].message).toMatch(/at least one size/i);
    expect(res.error?.issues[0].path).toEqual(["sizes"]);
  });

  it.each([
    [{ name: "   " }, "Enter a name"],
    [{ name: "x".repeat(61) }, "60 characters or fewer"],
    [{ lowStockLevel: "-1" }, "whole number"],
    [{ lowStockLevel: "2.5" }, "whole number"],
    [{ lowStockLevel: "abc" }, "whole number"],
    [{ sizes: "x".repeat(61) }, "60 characters"],
  ])("rejects %j", (change, message) => {
    const res = itemSchema.safeParse({ ...ok, ...change });
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.error?.issues)).toContain(message);
  });

  it("rejects more than 300 sizes", () => {
    const many = Array.from({ length: 301 }, (_, i) => String(i)).join("\n");
    expect(itemSchema.safeParse({ ...ok, sizes: many }).success).toBe(false);
  });

  it("allows an empty stock level, which means automatic", () => {
    expect(itemSchema.safeParse({ ...ok, lowStockLevel: "" }).success).toBe(true);
    expect(itemSchema.safeParse({ ...ok, lowStockLevel: "0" }).success).toBe(true);
  });

  it("round-trips an item through the form", () => {
    const form = itemToForm(ITEM);
    expect(form).toMatchObject({ sizes: "54\n56", lowStockLevel: "4", issuanceCategory: OWN_LINE });
    const body = itemPayload(form, false);
    expect(body).toMatchObject({
      sizes: ["54", "56"],
      lowStockLevel: 4,
      issuanceCategory: "",
      onOrderList: false,
    });
    // The name can't change, so it isn't sent when editing.
    expect("name" in body).toBe(false);
  });

  it("sends the name when adding, trimmed, and null to clear a stock level", () => {
    const body = itemPayload({ ...ok, name: " Fleece ", lowStockLevel: "" }, true);
    expect(body).toMatchObject({ name: "Fleece", lowStockLevel: null });
  });

  it("sends no sizes or measurements for an item with no size", () => {
    const body = itemPayload({ ...ok, noSize: true, sizes: "leftover", sizingFields: ["chest"] }, true);
    expect(body).toMatchObject({ noSize: true, sizes: [], sizingFields: [] });
  });

  it("keeps a chosen shared record line", () => {
    expect(itemPayload({ ...ok, issuanceCategory: "Jumper" }, true).issuanceCategory).toBe("Jumper");
  });
});

describe("the badge form", () => {
  it("needs a name and at least one level", () => {
    expect(badgeSchema.safeParse({ ...EMPTY_BADGE, name: "Band", entries: "Blue" }).success).toBe(true);
    expect(badgeSchema.safeParse({ ...EMPTY_BADGE, name: "Band" }).success).toBe(false);
    expect(badgeSchema.safeParse({ ...EMPTY_BADGE, entries: "Blue" }).success).toBe(false);
  });

  it("sends levels or named badges, and the prefix only when adding a levels category", () => {
    const form = { ...EMPTY_BADGE, name: " Band ", prefix: " Band ", entries: "Blue\nGold" };
    expect(badgePayload(form, true)).toEqual({
      name: "Band",
      gainedWhere: true,
      levels: ["Blue", "Gold"],
      prefix: "Band",
    });
    expect("prefix" in badgePayload(form, false)).toBe(false);
    expect(badgePayload({ ...form, kind: "items", entries: "DofE Gold" }, true)).toEqual({
      name: "Band",
      gainedWhere: true,
      items: ["DofE Gold"],
    });
  });

  it("describes what orders will be called", () => {
    expect(badgeNames(BADGE)).toEqual(["Music – Blue", "Music – Gold"]);
    expect(badgeNames({ ...BADGE, prefix: null })).toEqual(["Music Badges – Blue", "Music Badges – Gold"]);
    expect(badgeNames({ ...BADGE, kind: "items", items: ["Leading"] })).toEqual(["Leading"]);
  });
});

describe("summaries", () => {
  it("lists what is unusual about an item", () => {
    expect(itemSummary(ITEM)).toBe("2 sizes · orders below 4 · not on the order list · in new cadets' kit");
    expect(
      itemSummary({ ...ITEM, noSize: true, lowStockLevel: null, onOrderList: true, kitFlight: false })
    ).toBe("No size");
    expect(
      itemSummary({ ...ITEM, sizes: ["54"], lowStockLevel: null, onOrderList: true, kitFlight: false })
    ).toBe("1 size");
  });

  it("counts a category's badges and what is using them", () => {
    expect(badgeSummary(BADGE)).toBe("2 levels");
    expect(badgeSummary({ ...BADGE, inUse: 3, levels: ["Blue"] })).toBe("1 level · 3 in use");
    expect(badgeSummary({ ...BADGE, kind: "items", items: ["a", "b", "c"] })).toBe("3 badges");
  });
});

describe("moved", () => {
  it("swaps with the neighbour", () => {
    expect(moved([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moved([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
  });

  it("leaves the list alone at either end, and when empty", () => {
    expect(moved([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moved([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
    expect(moved([], 0, 1)).toEqual([]);
  });

  it("doesn't change the list it was given", () => {
    const ids = [1, 2];
    moved(ids, 0, 1);
    expect(ids).toEqual([1, 2]);
  });
});

describe("the API calls", () => {
  it("POSTs a new item and PATCHes an existing one, with the token", async () => {
    const fetchMock = vi.fn(async () => Response.json(ITEM));
    vi.stubGlobal("fetch", fetchMock);
    await saveItem("tok", null, itemPayload(itemToForm(ITEM), true));
    await saveItem("tok", 7, itemPayload(itemToForm(ITEM), false));
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toMatch(/\/catalogue\/uniform$/);
    expect(calls[0][1].method).toBe("POST");
    expect(calls[1][0]).toMatch(/\/catalogue\/uniform\/7$/);
    expect(calls[1][1].method).toBe("PATCH");
    expect((calls[1][1].headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("rejects with the API's own message, e.g. a 409 for a badge in use", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ detail: "Music – Gold has been ordered or is in stock" }, { status: 409 })
      )
    );
    await expect(saveBadge("tok", 3, badgePayload(EMPTY_BADGE, false))).rejects.toThrow(
      /Music – Gold has been ordered/
    );
  });

  it("flattens a validation list instead of showing [object Object]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ detail: [{ msg: "Value error, A name is required" }] }, { status: 422 })
      )
    );
    await expect(saveItem("tok", null, itemPayload(EMPTY_ITEM, true))).rejects.toThrow(
      "Value error, A name is required"
    );
  });

  it("falls back to a plain message when the API says nothing useful", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 }))
    );
    await expect(saveItem("tok", 1, itemPayload(EMPTY_ITEM, false))).rejects.toThrow(
      "Couldn't save the catalogue."
    );
  });

  it("says the server is unreachable when the request itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("network")))
    );
    await expect(saveItem("tok", 1, itemPayload(EMPTY_ITEM, false))).rejects.toThrow("Server unreachable.");
  });

  it("treats a 204 delete as success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 }))
    );
    await expect(deleteItem("tok", 7)).resolves.toBeNull();
  });
});
