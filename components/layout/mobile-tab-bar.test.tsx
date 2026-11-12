// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = vi.hoisted(() => ({
  current: { data: { role: "staff" } as { role?: string } | null, status: "authenticated" },
}));
vi.mock("next-auth/react", () => ({ useSession: () => SESSION.current, signOut: vi.fn() }));
const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { RecentPageTracker, resetQuickPagesForTest } from "@/lib/quick-pages";

const PINS = "sms.mobile.pins";
const RECENT = "sms.mobile.recent";

function renderBar(role: string | undefined, path = "/") {
  SESSION.current = { data: role ? { role } : null, status: "authenticated" };
  pathname.current = path;
  // The app shell mounts the tracker beside the bar.
  const view = render(
    <>
      <MobileTabBar />
      <RecentPageTracker />
    </>
  );
  return { nav: screen.getByRole("navigation", { name: "Quick links" }), ...view };
}

// `hidden`: while the menu sheet is open the page behind it, bar included, is
// aria-hidden, and the pinning tests check the bar from under the sheet.
const tabNames = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole("link", { hidden: true })
    .map((l) => l.textContent);

async function openMenu(nav: HTMLElement) {
  await userEvent.click(within(nav).getByRole("button", { name: "Menu" }));
  return screen.findByRole("dialog", { name: "Menu" });
}

beforeEach(() => {
  // A phone, so the menu is the bottom sheet.
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: true,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
  window.localStorage.clear();
  resetQuickPagesForTest();
  // jsdom has no pointer capture; the sheet's drag handling calls it.
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

describe("the pinned bar", () => {
  it.each([
    ["staff", ["Home", "Cadets", "Check-in", "Stock"]],
    ["snco", ["Home", "Check-in", "Plans", "Inspect"]],
    ["nco", ["Home", "Check-in", "Plans", "Leadership"]],
  ])("%s starts with four of their most-used pages, and Menu", (role, expected) => {
    const { nav } = renderBar(role);
    expect(tabNames(nav)).toEqual(expected);
    expect(within(nav).getByRole("button", { name: "Menu" })).toBeInTheDocument();
  });

  it("shows the pages this phone pinned, in its order", async () => {
    window.localStorage.setItem(PINS, JSON.stringify(["/stores/badges/orders", "/stores/uniform/orders"]));
    const { nav } = renderBar("staff");
    await waitFor(() => expect(tabNames(nav)).toEqual(["Badges Orders", "Orders"]));
  });

  it("lights the pinned page you're on, including a record below it", () => {
    const { nav } = renderBar("staff", "/cadets/overview");
    expect(within(nav).getByRole("link", { name: "Cadets" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("lights nothing on a page that isn't pinned", () => {
    const { nav } = renderBar("staff", "/texts/messages");
    expect(within(nav).queryByRole("link", { current: "page" })).not.toBeInTheDocument();
  });

  it("ignores unreadable or blocked storage and uses the defaults", () => {
    window.localStorage.setItem(PINS, "{not json");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    const { nav } = renderBar("staff");
    expect(tabNames(nav)).toEqual(["Home", "Cadets", "Check-in", "Stock"]);
  });

  it("before the session loads, offers just Home and the menu", () => {
    const { nav } = renderBar(undefined);
    expect(tabNames(nav)).toEqual(["Home"]);
  });

  it("stays out of print and off wider screens", () => {
    const { nav } = renderBar("staff");
    expect(nav).toHaveClass("no-print", "md:hidden");
  });
});

describe("the menu", () => {
  it("lists every page the role can open, under its section", async () => {
    const { nav } = renderBar("nco");
    const menu = await openMenu(nav);
    expect(within(menu).getByRole("link", { name: /Session Plans/ })).toHaveAttribute(
      "href",
      "/session-plans"
    );
    expect(within(menu).queryByRole("link", { name: /Catalogue/ })).not.toBeInTheDocument();
    expect(within(menu).getByRole("region", { name: "Marking Sheets" })).toBeInTheDocument();
  });

  it("pins a page to the bar, and unpins it", async () => {
    const { nav } = renderBar("staff");
    const menu = await openMenu(nav);
    await userEvent.click(within(menu).getByRole("button", { name: "Unpin Check-in" }));
    expect(tabNames(nav)).not.toContain("Check-in");
    await userEvent.click(within(menu).getByRole("button", { name: "Pin Parade Night Texts" }));
    expect(tabNames(nav)).toContain("Parade Night Texts");
    expect(JSON.parse(window.localStorage.getItem(PINS)!)).toEqual([
      "/",
      "/cadets/overview",
      "/stores/uniform/stock",
      "/texts/messages",
    ]);
  });

  it("takes as many pins as you like, and the bar scrolls once they don't fit", async () => {
    const { nav } = renderBar("staff");
    const menu = await openMenu(nav);
    await userEvent.click(within(menu).getByRole("button", { name: "Pin Squadron Stats" }));
    await userEvent.click(within(menu).getByRole("button", { name: "Pin Parade Night Texts" }));
    expect(tabNames(nav)).toEqual(["Home", "Cadets", "Check-in", "Stock", "Stats", "Parade Night Texts"]);
    expect(within(nav).getAllByRole("list", { hidden: true })[0]).toHaveClass("overflow-x-auto");
  });

  it("shares the width when four or fewer are pinned, with no scrolling", () => {
    const { nav } = renderBar("staff");
    expect(within(nav).getAllByRole("list")[0]).not.toHaveClass("overflow-x-auto");
  });

  it("finds a page by name or an old name", async () => {
    const { nav } = renderBar("staff");
    const menu = await openMenu(nav);
    await userEvent.type(within(menu).getByLabelText("Find a page"), "kitting");
    const results = within(menu).getByRole("region", { name: "Results" });
    expect(
      within(results)
        .getAllByRole("link")
        .map((l) => l.getAttribute("href"))
    ).toEqual(["/stores/uniform/orders"]);
    await userEvent.clear(within(menu).getByLabelText("Find a page"));
    await userEvent.type(within(menu).getByLabelText("Find a page"), "zzz");
    expect(within(menu).getByText("No page matches “zzz”.")).toBeInTheDocument();
  });

  it("puts the pages you used last at the top, not the one you're on", async () => {
    window.localStorage.setItem(RECENT, JSON.stringify(["/stores/badges/orders", "/texts/messages"]));
    const { nav } = renderBar("staff", "/texts/messages");
    const menu = await openMenu(nav);
    const recent = within(menu).getByRole("region", { name: "Recent" });
    expect(
      within(recent)
        .getAllByRole("link")
        .map((l) => l.getAttribute("href"))
    ).toEqual(["/stores/badges/orders"]);
  });

  it("has Settings and Sign out, which the old More reached through the sidebar", async () => {
    const { nav } = renderBar("nco");
    const menu = await openMenu(nav);
    expect(within(menu).getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(within(menu).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});

describe("recent pages", () => {
  it("records each page visited, newest first, once", () => {
    renderBar("staff", "/stores/badges/orders").unmount();
    renderBar("staff", "/texts/messages").unmount();
    renderBar("staff", "/stores/badges/orders");
    expect(JSON.parse(window.localStorage.getItem(RECENT)!)).toEqual([
      "/stores/badges/orders",
      "/texts/messages",
    ]);
  });

  it("records a record page as its list: a box is uniform stock", () => {
    renderBar("staff", "/stores/uniform/stock/BOX-A");
    expect(JSON.parse(window.localStorage.getItem(RECENT)!)).toEqual(["/stores/uniform/stock"]);
  });
});
