// @vitest-environment jsdom
// The Training area: one sidebar link whose four tabs (Tonight, Progress,
// Tasks & kit, Setup) are separate pages under one header, staff only. The
// classification and practical-session planners open from Tonight and light
// its tab; every old URL is sent to the right part.
import fs from "node:fs";
import nodePath from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TrainingLayout from "@/app/training/layout";
import { canAccess } from "@/lib/access";
import { activeTab, breadcrumbsFor, flattenLinks, NAV_SECTIONS } from "@/lib/navigation";
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

const training = NAV_SECTIONS.flatMap((sec) => sec.items).find((i) => i.label === "Training")!;

describe("Training's pages", () => {
  it("are four, in order, listed under Training in the menu", () => {
    expect(training.tabs!.map((t) => [t.label, t.href])).toEqual(Object.entries(TAB_HREFS));
  });

  it("share one header and no tab row: the sidebar and the phone's hub move between them", () => {
    renderAt("/training/progress");
    expect(screen.getByRole("heading", { level: 1, name: "Training" })).toBeInTheDocument();
    expect(screen.getByText("page body")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it.each(Object.entries(TAB_HREFS))("%s is the current page on its own page", (label, href) => {
    // Tonight is the index: it mustn't light up on every other part too.
    expect(activeTab(href, training.tabs!)?.label).toBe(label);
  });

  it.each(["/training/classifications", "/training/sessions"])(
    "%s is planned from Tonight, so it lights Tonight",
    (href) => {
      expect(activeTab(href, training.tabs!)?.label).toBe("Tonight");
    }
  );
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
