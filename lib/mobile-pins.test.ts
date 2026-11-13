import { describe, expect, it } from "vitest";

import {
  addRecent,
  currentPins,
  defaultPins,
  DEFAULT_PIN_COUNT,
  MAX_RECENT,
  pageFor,
  pinLabel,
  reachablePages,
  searchPages,
  togglePin,
} from "@/lib/mobile-pins";
import { visibleSections } from "@/lib/navigation";

const pagesFor = (role: string) => reachablePages(visibleSections(role, "someone@317atc.co.uk"));
const staff = pagesFor("staff");
const nco = pagesFor("nco");

describe("default pins", () => {
  it("are the role's most-used pages, four of them", () => {
    expect(defaultPins("staff", staff)).toEqual([
      "/",
      "/cadets/overview",
      "/check-in",
      "/stores/uniform/stock",
    ]);
  });

  it("skip what the role can't open: an NCO gets no inspection sheet", () => {
    const pins = defaultPins("nco", nco);
    expect(pins).toHaveLength(DEFAULT_PIN_COUNT);
    expect(pins).not.toContain("/assessments/inspection");
  });

  it("are just Home for someone with no role yet", () => {
    expect(defaultPins(undefined, reachablePages(visibleSections(undefined, undefined)))).toEqual(["/"]);
  });
});

describe("current pins", () => {
  it("use the defaults until someone chooses", () => {
    expect(currentPins(null, "staff", staff)).toEqual(defaultPins("staff", staff));
  });

  it("keep a chosen, empty bar empty rather than refilling it", () => {
    expect(currentPins([], "staff", staff)).toEqual([]);
  });

  it("drop pages the user can no longer reach and duplicates, and keep as many as were pinned", () => {
    const stored = [
      "/stores/badges/orders",
      "/stores/catalogue",
      "/stores/catalogue",
      "/nowhere",
      "/stats",
      "/texts/messages",
      "/recruits",
    ];
    expect(currentPins(stored, "staff", staff)).toEqual([
      "/stores/badges/orders",
      "/stores/catalogue",
      "/stats",
      "/texts/messages",
      "/recruits",
    ]);
    // A staff pin on an NCO's phone (shared phone, role changed) just goes.
    expect(currentPins(["/stores/catalogue", "/check-in"], "nco", nco)).toEqual(["/check-in"]);
  });
});

describe("pinning", () => {
  it("adds to the end and removes in place", () => {
    expect(togglePin(["/a"], "/b")).toEqual(["/a", "/b"]);
    expect(togglePin(["/a", "/b", "/c"], "/b")).toEqual(["/a", "/c"]);
  });

  it("has no limit", () => {
    const many = ["/a", "/b", "/c", "/d", "/e", "/f"];
    expect(togglePin(many, "/g")).toEqual([...many, "/g"]);
  });
});

describe("recent pages", () => {
  it("puts the newest first, once, and keeps only a few", () => {
    let recent: string[] = [];
    for (const href of ["/a", "/b", "/a", "/c", "/d", "/e", "/f"]) recent = addRecent(recent, href);
    expect(recent).toEqual(["/f", "/e", "/d", "/c", "/a"]);
    expect(recent).toHaveLength(MAX_RECENT);
  });
});

describe("which page you're on", () => {
  it.each([
    ["/stores/badges/orders", "/stores/badges/orders"],
    ["/stores/uniform/stock/BOX-A", "/stores/uniform/stock"],
    ["/session-plans/12", "/session-plans"],
    ["/", "/"],
  ])("%s is %s", (pathname, href) => {
    expect(pageFor(pathname, staff)?.href).toBe(href);
  });

  it("is nothing for a page the map doesn't list", () => {
    expect(pageFor("/settings", staff)).toBeNull();
  });
});

describe("names on the bar", () => {
  const page = (href: string) => staff.find((p) => p.href === href)!;

  it("use the short names people know where there is one", () => {
    expect(pinLabel(page("/stores/badges/stock"), "staff", staff)).toBe("Badges");
    expect(pinLabel(page("/stores/uniform/orders"), "staff", staff)).toBe("Orders");
  });

  it("put the group in front of a name that's ambiguous on its own", () => {
    expect(pinLabel(page("/stores/badges/orders"), "staff", staff)).toBe("Badges Orders");
  });

  it("use the page's own name otherwise", () => {
    expect(pinLabel(page("/texts/recipients"), "staff", staff)).toBe("Text Recipients");
  });
});

describe("searching pages", () => {
  it("matches names, sections and old names, every word", () => {
    expect(searchPages(staff, "badge orders").map((p) => p.href)).toContain("/stores/badges/orders");
    expect(searchPages(staff, "kitting").map((p) => p.href)).toEqual(["/stores/uniform/orders"]);
    expect(searchPages(staff, "   ")).toEqual([]);
    expect(searchPages(staff, "zzzz")).toEqual([]);
  });

  it("only finds pages the role can open", () => {
    expect(searchPages(nco, "catalogue")).toEqual([]);
  });
});
