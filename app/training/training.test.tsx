// @vitest-environment jsdom
// The Training area: one sidebar link whose four tabs (Tonight, Progress,
// Tasks & kit, Setup) are separate pages under one header, staff only. The
// classification and practical-session planners open from Tonight and light
// its tab; every old URL is sent to the right part.
import fs from "node:fs";
import nodePath from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TrainingLayout from "@/app/training/layout";
import { canAccess } from "@/lib/access";
import { breadcrumbsFor, flattenLinks, NAV_SECTIONS } from "@/lib/navigation";
import { CLASSIFICATIONS_REDIRECTS, TRAINING_REDIRECTS } from "@/next.config";

const path = vi.hoisted(() => ({ current: "/training" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { role: "staff", user: { email: "s@317atc.co.uk" } } }),
}));

function renderAt(pathname: string) {
  path.current = pathname;
  return render(
    <TrainingLayout>
      <p>page body</p>
    </TrainingLayout>
  );
}

const TAB_HREFS = {
  Tonight: "/training",
  Progress: "/training/progress",
  "Tasks & kit": "/training/tasks",
  Setup: "/training/setup",
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
    // Tonight is the index: it mustn't light up on every other part too.
    expect(current.map((l) => l.textContent)).toEqual([label]);
  });

  it.each(["/training/classifications", "/training/sessions"])(
    "%s is planned from Tonight, so it lights Tonight",
    (href) => {
      renderAt(href);
      const nav = screen.getByRole("navigation", { name: "Training" });
      expect(within(nav).getByRole("link", { current: "page" })).toHaveTextContent("Tonight");
    }
  );
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
    expect(breadcrumbsFor("/training")).toEqual([
      { label: "Parade Night" },
      { label: "Training" },
      { label: "Tonight" },
    ]);
    expect(breadcrumbsFor("/training/sessions")).toEqual([
      { label: "Parade Night" },
      { label: "Training" },
      { label: "Tonight", href: "/training" },
    ]);
    expect(breadcrumbsFor("/training/progress").map((c) => c.label)).toEqual([
      "Parade Night",
      "Training",
      "Progress",
    ]);
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
    [{}, "/training/classifications"],
    [{ tab: "progress" }, "/training/progress"],
    // The Record tab became a button on Progress before this move.
    [{ tab: "record" }, "/training/progress"],
    [{ tab: "qr" }, "/training/setup"],
    [{ tab: "nonsense" }, "/training/classifications"],
  ])("?%o goes to %s", (query, destination) => {
    expect(redirectFor("/cadets/classifications", query)).toBe(destination);
  });
});

describe("old Training tabs", () => {
  it.each([
    ["/training/nights", "/training"],
    ["/training/catch-ups", "/training/progress?view=missed"],
    ["/training/qr-codes", "/training/setup"],
    ["/training/links", "/training/setup"],
  ])("%s goes to %s", (source, destination) => {
    expect(TRAINING_REDIRECTS.find((r) => r.source === source)?.destination).toBe(destination);
  });

  it("sends nothing to a page that no longer exists", () => {
    for (const { destination } of [...TRAINING_REDIRECTS, ...CLASSIFICATIONS_REDIRECTS]) {
      const page = destination.split("?")[0].replace(/^\/training/, "app/training");
      expect(fs.existsSync(nodePath.join(process.cwd(), page, "page.tsx")), destination).toBe(true);
    }
  });
});
