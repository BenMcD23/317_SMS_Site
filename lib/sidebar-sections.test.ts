import { describe, expect, it } from "vitest";

import { activeSectionLabel, isSectionOpen } from "@/lib/sidebar-sections";

const LABELS = ["Cadets", "Stores", "Squadron"];

describe("activeSectionLabel", () => {
  it("finds the section a page, or a record below it, lives in", () => {
    expect(activeSectionLabel("/cadets/audit", LABELS)).toBe("Cadets");
    expect(activeSectionLabel("/cadets/2100003", LABELS)).toBe("Cadets");
    expect(activeSectionLabel("/stores/uniform/orders", LABELS)).toBe("Stores");
  });

  it("is null for pages outside any heading, or a section the user can't see", () => {
    expect(activeSectionLabel("/", LABELS)).toBeNull();
    expect(activeSectionLabel("/settings", LABELS)).toBeNull();
    expect(activeSectionLabel("/tools/scraper", LABELS)).toBeNull(); // "Data", not in LABELS
  });
});

describe("isSectionOpen", () => {
  it("opens only the current page's section on a first visit", () => {
    expect(isSectionOpen("Cadets", {}, "Cadets", false)).toBe(true);
    expect(isSectionOpen("Stores", {}, "Cadets", false)).toBe(false);
  });

  it("remembers sections the user opened or closed", () => {
    expect(isSectionOpen("Stores", { Stores: true }, "Cadets", false)).toBe(true);
    expect(isSectionOpen("Stores", { Stores: false }, "Stores", false)).toBe(true);
  });

  it("keeps the current section open even if it was closed elsewhere, unless closed on this page", () => {
    // Closed last week, but we've just navigated here: the page must be visible in the menu.
    expect(isSectionOpen("Cadets", { Cadets: false }, "Cadets", false)).toBe(true);
    expect(isSectionOpen("Cadets", {}, "Cadets", true)).toBe(false);
  });
});
