import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { canAccess } from "@/lib/access";
import { OWNER_EMAIL } from "@/lib/config";
import {
  activeMobileTab,
  activeTab,
  hubHref,
  hubSections,
  mobileHubFor,
  sectionFor,
  sectionSlug,
  areaFor,
  breadcrumbsFor,
  flattenLinks,
  isLinkActive,
  isNavLinkActive,
  mobileTabsFor,
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

  it("never has an empty area, and an area's row opens its first page", () => {
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        if (!item.tabs) continue;
        expect(item.tabs.length).toBeGreaterThan(1);
        expect(item.href).toBe(item.tabs[0].href);
      }
    }
  });

  it("keeps the staff menu short: one row per job", () => {
    const rows = visibleSections("staff", "someone@317atc.co.uk").flatMap((s) => s.items);
    expect(rows.length).toBeLessThanOrEqual(26);
    // ...without losing a page: every page is still a tab or a row.
    expect(flattenLinks(NAV_SECTIONS).length).toBeGreaterThan(rows.length);
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

  it("lists the Catalogue under Stores for staff and nobody else", () => {
    expect(hrefs("staff")).toContain("/stores/catalogue");
    for (const role of ["snco", "nco", undefined]) expect(hrefs(role)).not.toContain("/stores/catalogue");
    expect(breadcrumbsFor("/stores/catalogue").map((c) => c.label)).toEqual(["Stores", "Catalogue"]);
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

  it("hides the OC dashboard unless the API says this is the OC", () => {
    expect(hrefs("staff", "oc@317atc.co.uk")).not.toContain("/oc");
    expect(hrefs("staff", "oc@317atc.co.uk")).not.toContain("/oc/custom");
    const ocLinks = flattenLinks(visibleSections("staff", "oc@317atc.co.uk", true)).map((l) => l.href);
    expect(ocLinks).toContain("/oc");
    expect(ocLinks).toContain("/oc/leaving");
    expect(ocLinks).toContain("/oc/custom");
  });

  it("puts the OC dashboard, leaving process and staff together in an OC area", () => {
    const rows = visibleSections("staff", "oc@317atc.co.uk", true).flatMap((s) => s.items);
    const oc = rows.find((r) => r.label === "OC");
    expect(oc?.tabs?.map((t) => t.href)).toEqual(["/oc", "/oc/custom", "/oc/leaving", "/staff/overview"]);
    // Nobody else gets an empty OC row.
    const others = visibleSections("staff", "other@317atc.co.uk").flatMap((s) => s.items);
    expect(others.some((r) => r.label === "OC")).toBe(false);
  });

  it("drops the tabs a role can't reach, and opens the area on the first it can", () => {
    const rows = (role: string) => visibleSections(role, "n@x").flatMap((s) => s.items);
    const assessments = (role: string) => rows(role).find((r) => r.label === "Assessments");
    expect(assessments("staff")?.tabs?.map((t) => t.label)).toContain("MOI");
    expect(assessments("nco")?.tabs?.map((t) => t.label)).toEqual([
      "Leadership",
      "Radio",
      "Space",
      "Results",
    ]);
    // An SNCO can mark an inspection but not see the history: one tab, the sheet.
    const inspections = rows("snco").find((r) => r.label === "Inspections");
    expect(inspections?.tabs?.map((t) => t.href)).toEqual(["/assessments/inspection"]);
    expect(rows("nco").some((r) => r.label === "Inspections")).toBe(false);
  });

  it("the old leaving page is gone, and staff is the OC's alone", () => {
    expect(hrefs("staff", OWNER_EMAIL)).not.toContain("/cadets/leaving");
    expect(hrefs("staff", "other@317atc.co.uk")).not.toContain("/staff/overview");
  });

  it("drops empty sections and areas entirely", () => {
    for (const section of visibleSections("nco", "n@x")) {
      expect(section.items.length).toBeGreaterThan(0);
      for (const item of section.items) if (item.tabs) expect(item.tabs.length).toBeGreaterThan(0);
    }
  });
});

describe("active state", () => {
  it("matches whole segments and treats / as exact", () => {
    expect(isLinkActive("/", "/")).toBe(true);
    expect(isLinkActive("/cadets", "/")).toBe(false);
    // The OC dashboard link shouldn't light up on the leaving page beneath it.
    expect(isLinkActive("/oc", "/oc", true)).toBe(true);
    expect(isLinkActive("/oc/leaving", "/oc", true)).toBe(false);
    expect(isLinkActive("/oc/leaving", "/oc")).toBe(true);
    expect(isLinkActive("/cadets/audit", "/cadets/audit")).toBe(true);
    expect(isLinkActive("/cadets/audit/x", "/cadets/audit")).toBe(true);
    expect(isLinkActive("/cadets/auditing", "/cadets/audit")).toBe(false);
  });

  it("a group's row is active on any of its pages", () => {
    const badges = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.label === "Badges")!;
    expect(isNavLinkActive("/stores/badges/stock", badges)).toBe(true);
    expect(isNavLinkActive("/stores/badges/orders", badges)).toBe(true);
    expect(isNavLinkActive("/stores/uniform/orders", badges)).toBe(false);
  });

  it("splits Stores into Uniform and Badges, as before, with Catalogue on its own", () => {
    const stores = NAV_SECTIONS.find((s) => s.label === "Stores")!;
    expect(stores.items.map((i) => [i.label, i.tabs?.map((t) => t.label)])).toEqual([
      ["Uniform", ["Stock", "Orders", "Insights"]],
      ["Badges", ["Stock", "Orders"]],
      ["Catalogue", undefined],
    ]);
  });

  it("gives every page in a group its own icon", () => {
    for (const item of NAV_SECTIONS.flatMap((s) => s.items))
      for (const tab of item.tabs ?? []) expect(tab.icon, `${item.label} › ${tab.label}`).toBeDefined();
  });

  it("picks the deepest tab, so an index tab doesn't light up beneath itself", () => {
    const attendance = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.label === "Attendance")!;
    expect(activeTab("/attendance", attendance.tabs!)?.label).toBe("Squadron");
    expect(activeTab("/attendance/ncos", attendance.tabs!)?.label).toBe("NCOs");
  });

  it("finds a page's area, but not for a page that stands alone", () => {
    const sections = visibleSections("staff", "someone@317atc.co.uk");
    expect(areaFor("/texts/recipients", sections)?.label).toBe("Texts");
    expect(areaFor("/stores/uniform/stock/BOX-A", sections)?.label).toBe("Uniform");
    expect(areaFor("/stores/catalogue", sections)).toBeNull();
    expect(areaFor("/", sections)).toBeNull();
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
      { label: "Cadets", href: "/cadets/overview" },
    ]);
    expect(breadcrumbsFor("/staff/12")).toEqual([
      { label: "Admin" },
      { label: "OC" },
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

describe("mobile tab bar and section hubs", () => {
  const labels = (role: string | undefined) => mobileTabsFor(role).map((t) => t.label);
  const hrefs = (role: string) =>
    flattenLinks(visibleSections(role, "someone@317atc.co.uk")).map((l) => l.href);

  it.each([
    ["staff", ["Home", "Cadets", "Parade Night", "Stores"]],
    ["snco", ["Home", "Parade Night", "NCO Team"]],
    ["nco", ["Home", "Parade Night", "NCO Team"]],
  ])("%s gets its main sections", (role, expected) => {
    expect(labels(role)).toEqual(expected);
  });

  it("a signed-out or unknown role gets only Home", () => {
    expect(labels(undefined)).toEqual(["Home"]);
    expect(labels("cadet")).toEqual(["Home"]);
  });

  it("slugs a section's name for its hub address", () => {
    expect(sectionSlug("Parade Night")).toBe("parade-night");
    expect(sectionSlug("NCO Team")).toBe("nco-team");
    expect(hubHref("Stores")).toBe("/m/stores");
  });

  it.each([
    ["/stores/badges/orders", "Stores"],
    ["/stores/uniform/stock/BOX-A", "Stores"],
    ["/cadets/2100003", "Cadets"],
    ["/training/progress", "Parade Night"],
    ["/stats", ""],
    ["/settings", ""],
    ["/", null],
    ["/m/stores", null],
    ["/nowhere", null],
  ])("puts %s in section %j", (pathname, expected) => {
    expect(sectionFor(pathname)).toBe(expected);
  });

  it.each([
    ["staff", "/", "Home"],
    ["staff", "/m/stores", "Stores"],
    ["staff", "/cadets/1234", "Cadets"],
    ["staff", "/recruits", "Cadets"],
    ["staff", "/stores/catalogue", "Stores"],
    ["staff", "/training/progress", "Parade Night"],
    // Not on staff's bar: More.
    ["staff", "/texts/messages", null],
    ["staff", "/oc", null],
    ["nco", "/cadets/assessments", "Parade Night"],
    ["nco", "/session-plans/12", "NCO Team"],
    ["nco", "/settings", null],
  ])("%s on %s lights %s", (role, pathname, expected) => {
    expect(activeMobileTab(pathname, mobileTabsFor(role))?.label ?? null).toBe(expected);
  });

  it.each([
    ["staff", "/stores/badges/orders", { label: "Stores", href: "/m/stores" }],
    ["staff", "/texts/recipients", { label: "More", href: "/m/more" }],
    ["nco", "/assessments/radio", { label: "Parade Night", href: "/m/parade-night" }],
    ["nco", "/stats", { label: "More", href: "/m/more" }],
    ["staff", "/", null],
    ["staff", "/m/more", null],
  ])("%s on %s goes back to %o", (role, pathname, expected) => {
    expect(mobileHubFor(pathname, role)).toEqual(expected);
  });

  it.each(["staff", "snco", "nco"])("every hub %s can open lists only pages they can reach", (role) => {
    const visible = visibleSections(role, "someone@317atc.co.uk");
    const slugs = [...mobileTabsFor(role).filter((t) => t.href !== "/"), { href: "/m/more" }].map((t) =>
      t.href.replace("/m/", "")
    );
    for (const slug of slugs) {
      const hub = hubSections(slug, role, visible);
      expect(hub, slug).not.toBeNull();
      for (const href of flattenLinks(hub!.sections).map((l) => l.href)) {
        expect(canAccess(role, href), `${slug}: ${href}`).toBe(true);
        expect(hrefs(role)).toContain(href);
      }
    }
  });

  it("More holds every section not on the bar, and not Home", () => {
    const visible = visibleSections("staff", "someone@317atc.co.uk");
    const more = hubSections("more", "staff", visible)!;
    expect(more.sections.map((s) => s.label ?? "")).toEqual(["", "NCO Team", "Comms", "Admin"]);
    expect(flattenLinks(more.sections).map((l) => l.href)).not.toContain("/");
    expect(flattenLinks(more.sections).map((l) => l.href)).toContain("/stats");
  });

  it("between them, the bar's hubs and More reach every page in the menu", () => {
    for (const role of ["staff", "nco"]) {
      const visible = visibleSections(role, "someone@317atc.co.uk");
      const slugs = [
        ...mobileTabsFor(role)
          .filter((t) => t.href !== "/")
          .map((t) => t.href.slice(3)),
        "more",
      ];
      const reached = slugs.flatMap((slug) =>
        flattenLinks(hubSections(slug, role, visible)!.sections).map((l) => l.href)
      );
      for (const href of hrefs(role).filter((h) => h !== "/"))
        expect(reached, `${role} ${href}`).toContain(href);
    }
  });

  it("finds no hub for an unknown section, or one an NCO can't see", () => {
    expect(hubSections("nowhere", "staff", visibleSections("staff", "s@x"))).toBeNull();
    expect(hubSections("stores", "nco", visibleSections("nco", "n@x"))).toBeNull();
  });

  it("every hub is a page anyone signed in can open", () => {
    for (const role of ["staff", "snco", "nco"]) expect(canAccess(role, "/m/stores")).toBe(true);
  });
});
