import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { canAccess } from "@/lib/access";
import { OWNER_EMAIL } from "@/lib/config";
import {
  breadcrumbsFor,
  flattenLinks,
  isGroup,
  isGroupActive,
  isLinkActive,
  NAV_SECTIONS,
  visibleSections,
} from "@/lib/navigation";

const ALL_LINKS = flattenLinks(NAV_SECTIONS);
const hrefs = (role: string | undefined, email?: string) =>
  flattenLinks(visibleSections(role, email)).map((l) => l.href);

describe("the site map", () => {
  it.each(ALL_LINKS.map((l) => [l.href]))("%s is a real page", (href) => {
    const page = path.join(process.cwd(), "app", href, "page.tsx");
    expect(fs.existsSync(page), `${page} missing — the sidebar would 404`).toBe(true);
  });

  it("lists every page once", () => {
    const all = ALL_LINKS.map((l) => l.href);
    expect(new Set(all).size).toBe(all.length);
  });

  it("never has an empty group", () => {
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) if (isGroup(item)) expect(item.links.length).toBeGreaterThan(0);
    }
  });
});

describe("visibleSections", () => {
  it("only ever shows links the middleware will let through", () => {
    for (const role of ["staff", "snco", "nco", undefined]) {
      for (const href of hrefs(role, "someone@317atc.co.uk")) expect(canAccess(role, href)).toBe(true);
    }
  });

  it("gives staff more than SNCOs, and SNCOs more than NCOs", () => {
    const staff = hrefs("staff");
    const snco = hrefs("snco");
    const nco = hrefs("nco");
    expect(nco.every((h) => snco.includes(h))).toBe(true);
    expect(snco.every((h) => staff.includes(h))).toBe(true);
    expect(staff.length).toBeGreaterThan(snco.length);
  });

  it("hides owner-only links from everyone but the owner", () => {
    const ownerOnly = ALL_LINKS.filter((l) => l.ownerOnly).map((l) => l.href);
    const sectionOwnerOnly = NAV_SECTIONS.filter((s) => s.ownerOnly).flatMap((s) =>
      flattenLinks([s]).map((l) => l.href)
    );
    const gated = [...ownerOnly, ...sectionOwnerOnly];
    expect(gated.length).toBeGreaterThan(0);
    expect(hrefs("staff", "other@317atc.co.uk").some((h) => gated.includes(h))).toBe(false);
    expect(gated.every((h) => hrefs("staff", OWNER_EMAIL.toUpperCase()).includes(h))).toBe(true);
  });

  it("hides the OC dashboard unless the OC is configured and signed in", async () => {
    expect(hrefs("staff", "oc@317atc.co.uk")).not.toContain("/oc");
    vi.stubEnv("NEXT_PUBLIC_OC_EMAIL", "oc@317atc.co.uk");
    vi.resetModules();
    const nav = await import("@/lib/navigation");
    const ocLinks = nav.flattenLinks(nav.visibleSections("staff", "OC@317atc.co.uk")).map((l) => l.href);
    expect(ocLinks).toContain("/oc");
  });

  it("drops empty sections and groups entirely", () => {
    for (const section of visibleSections("nco", "n@x")) {
      expect(section.items.length).toBeGreaterThan(0);
      for (const item of section.items) if (isGroup(item)) expect(item.links.length).toBeGreaterThan(0);
    }
  });
});

describe("active state", () => {
  it("matches whole segments and treats / as exact", () => {
    expect(isLinkActive("/", "/")).toBe(true);
    expect(isLinkActive("/cadets", "/")).toBe(false);
    expect(isLinkActive("/cadets/audit", "/cadets/audit")).toBe(true);
    expect(isLinkActive("/cadets/audit/x", "/cadets/audit")).toBe(true);
    expect(isLinkActive("/cadets/auditing", "/cadets/audit")).toBe(false);
  });

  it("a group is active when any child is", () => {
    const group = NAV_SECTIONS.flatMap((s) => s.items).find(isGroup)!;
    expect(isGroupActive(group.links[0].href, group)).toBe(true);
    expect(isGroupActive("/nowhere", group)).toBe(false);
  });
});

describe("breadcrumbsFor", () => {
  it("names the trail to an exact page with no link on the last crumb", () => {
    const crumbs = breadcrumbsFor("/stores/uniform/stock");
    expect(crumbs.map((c) => c.label)).toEqual(["Stores", "Uniform", "Stock"]);
    expect(crumbs[crumbs.length - 1].href).toBeUndefined();
  });

  it("links the nearest ancestor for a deeper page", () => {
    const crumbs = breadcrumbsFor("/stores/uniform/stock/BOX-A");
    expect(crumbs[crumbs.length - 1]).toEqual({ label: "Stock", href: "/stores/uniform/stock" });
  });

  it("trails a cadet or staff record back to its list, with the list linked", () => {
    expect(breadcrumbsFor("/cadets/2100003")).toEqual([
      { label: "Cadets" },
      { label: "Overview", href: "/cadets/overview" },
    ]);
    expect(breadcrumbsFor("/staff/12")).toEqual([
      { label: "Squadron" },
      { label: "Staff", href: "/staff/overview" },
    ]);
    // Real pages under /cadets keep their own trail, not the record fallback.
    expect(breadcrumbsFor("/cadets/audit").map((c) => c.label)).toEqual(["Cadets", "Audit"]);
  });

  it("knows unlisted pages and gives up on unknown ones", () => {
    expect(breadcrumbsFor("/settings")).toEqual([{ label: "Settings" }]);
    expect(breadcrumbsFor("/definitely/not/a/page")).toEqual([]);
  });

  it("picks the deepest match, not the first", () => {
    const crumbs = breadcrumbsFor("/cadets/audit");
    expect(crumbs[crumbs.length - 1].label).toBe("Audit");
  });
});
