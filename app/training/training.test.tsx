// @vitest-environment jsdom
// The Training area: one sidebar link whose parts (nights, classifications,
// sessions, catch-ups, theory progress, tasks & kit, QR codes, programme
// links) are separate pages under one header,
// staff only, with the old Classifications and Session Planner URLs sent to
// the right part.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TrainingLayout from "@/app/training/layout";
import { canAccess } from "@/lib/access";
import { breadcrumbsFor, flattenLinks, activeMobileTab, mobileTabsFor, NAV_SECTIONS } from "@/lib/navigation";
import { CLASSIFICATIONS_REDIRECTS } from "@/next.config";

const path = vi.hoisted(() => ({ current: "/training" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));

function renderAt(pathname: string) {
  path.current = pathname;
  return render(
    <TrainingLayout>
      <p>page body</p>
    </TrainingLayout>
  );
}

const TAB_HREFS = {
  Nights: "/training/nights",
  Classifications: "/training",
  Sessions: "/training/sessions",
  "Catch-ups": "/training/catch-ups",
  "Theory progress": "/training/progress",
  "Tasks & kit": "/training/tasks",
  "QR codes": "/training/qr-codes",
  "Programme links": "/training/links",
};

describe("Training tabs", () => {
  it("are links to each part, in order, with the page under them", () => {
    renderAt("/training");
    const nav = screen.getByRole("navigation", { name: "Training" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual(Object.entries(TAB_HREFS));
    expect(screen.getByRole("heading", { name: "Training" })).toBeInTheDocument();
    expect(screen.getByText("page body")).toBeInTheDocument();
  });

  it.each(Object.entries(TAB_HREFS))("%s is the current tab on its own page", (label, href) => {
    renderAt(href);
    const nav = screen.getByRole("navigation", { name: "Training" });
    const current = within(nav)
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    // Classifications is the index: it mustn't light up on every other part too.
    expect(current.map((l) => l.textContent)).toEqual([label]);
  });
});

describe("who can open it", () => {
  it.each([
    ["staff", true],
    ["snco", false],
    ["nco", false],
    [undefined, false],
  ])("%s → %s, on every part", (role, allowed) => {
    for (const href of Object.values(TAB_HREFS)) expect(canAccess(role, href)).toBe(allowed);
  });
});

describe("navigation", () => {
  it("is one sidebar link in place of Classifications and Session Planner", () => {
    const hrefs = flattenLinks(NAV_SECTIONS).map((l) => l.href);
    expect(hrefs).toContain("/training");
    for (const old of [
      "/cadets/classifications",
      "/cadets/theory",
      "/session-planner",
      "/session-planner/bank",
    ]) {
      expect(hrefs).not.toContain(old);
    }
  });

  it("names the area in the breadcrumbs on every part", () => {
    expect(breadcrumbsFor("/training")).toEqual([{ label: "Cadets" }, { label: "Training" }]);
    expect(breadcrumbsFor("/training/sessions")).toEqual([
      { label: "Cadets" },
      { label: "Training", href: "/training" },
    ]);
  });

  it("lights the phone's Training tab", () => {
    expect(activeMobileTab("/training/sessions", mobileTabsFor("staff"))?.label).toBe("Training");
  });
});

/** Where Next would send a request, by the redirects' own rules (first match wins). */
function redirectFor(pathname: string, query: Record<string, string> = {}): string | undefined {
  const hit = CLASSIFICATIONS_REDIRECTS.find(
    (r) => r.source === pathname && ("has" in r ? r.has.every((h) => query[h.key] === h.value) : true)
  );
  return hit?.destination;
}

describe("old Classifications links", () => {
  it.each([
    [{}, "/training"],
    [{ tab: "progress" }, "/training/progress"],
    // The Record tab became a button on Progress before this move.
    [{ tab: "record" }, "/training/progress"],
    [{ tab: "qr" }, "/training/qr-codes"],
    [{ tab: "nonsense" }, "/training"],
  ])("?%o goes to %s", (query, destination) => {
    expect(redirectFor("/cadets/classifications", query)).toBe(destination);
  });
});
