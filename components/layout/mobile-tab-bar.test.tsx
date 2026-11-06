// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeSession = { role?: string; is_oc?: boolean; user?: { email?: string } };
const SESSION = vi.hoisted(() => ({
  current: { data: { role: "staff" } as FakeSession, status: "authenticated" },
}));
vi.mock("next-auth/react", () => ({ useSession: () => SESSION.current }));
const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";

function SidebarState() {
  const { openMobile } = useSidebar();
  return <output aria-label="sidebar">{openMobile ? "open" : "closed"}</output>;
}

function Harness() {
  return (
    <SidebarProvider>
      <MobileTabBar />
      <SidebarState />
    </SidebarProvider>
  );
}

function renderBar(role: string | undefined, path = "/", extra: Partial<FakeSession> = {}) {
  SESSION.current = { data: { role, ...extra }, status: "authenticated" };
  pathname.current = path;
  const view = render(<Harness />);
  return { nav: screen.getByRole("navigation", { name: "Quick links" }), ...view };
}

const tabNames = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole("button")
    .map((b) => b.textContent);

beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: true,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
});

describe("mobile tab bar", () => {
  it.each([
    ["staff", ["Home", "Cadets", "Marking", "NCOs", "Stores", "Comms", "Squadron", "Data", "Menu"]],
    ["snco", ["Home", "Cadets", "Marking", "NCOs", "Menu"]],
    ["nco", ["Home", "Cadets", "Marking", "NCOs", "Menu"]],
  ])("%s gets a tab per section, then Menu", (role, labels) => {
    expect(tabNames(renderBar(role).nav)).toEqual(labels);
  });

  it("before the session loads there's just Home and Menu, nothing to bounce off", () => {
    expect(tabNames(renderBar(undefined).nav)).toEqual(["Home", "Menu"]);
  });

  it("marks the current page's section, and only that one", () => {
    const { nav } = renderBar("staff", "/stores/badges/orders");
    expect(within(nav).getByRole("button", { name: "Stores" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getAllByRole("button", { current: "page" })).toHaveLength(1);
  });

  it("marks nothing on a page in no section", () => {
    const { nav } = renderBar("staff", "/settings");
    expect(within(nav).queryByRole("button", { current: "page" })).not.toBeInTheDocument();
  });

  it("tapping a section opens its pages above the bar, groups and all", async () => {
    const { nav } = renderBar("staff", "/stores/uniform/orders");
    const stores = within(nav).getByRole("button", { name: "Stores" });
    expect(stores).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(stores);
    expect(stores).toHaveAttribute("aria-expanded", "true");

    const sheet = screen.getByRole("dialog", { name: "Stores" });
    expect(within(sheet).getByText("Uniform")).toBeInTheDocument();
    expect(within(sheet).getByText("Badges")).toBeInTheDocument();
    expect(
      within(sheet)
        .getAllByRole("link")
        .map((l) => l.getAttribute("href"))
    ).toEqual([
      "/stores/uniform/stock",
      "/stores/uniform/orders",
      "/stores/uniform/insights",
      "/stores/badges/stock",
      "/stores/badges/orders",
      "/stores/catalogue",
    ]);
    // The page you're on is marked in the sheet too.
    expect(within(sheet).getByRole("link", { current: "page" })).toHaveAttribute(
      "href",
      "/stores/uniform/orders"
    );
  });

  it("focus moves to the sheet so a screen reader hears which section opened", async () => {
    const { nav } = renderBar("nco");
    await userEvent.click(within(nav).getByRole("button", { name: "NCOs" }));
    expect(screen.getByRole("heading", { name: "NCOs" })).toHaveFocus();
  });

  it("an NCO's Marking sheet only offers sheets they can use", async () => {
    const { nav } = renderBar("nco");
    await userEvent.click(within(nav).getByRole("button", { name: "Marking" }));
    const sheet = screen.getByRole("dialog", { name: "Marking" });
    expect(
      within(sheet)
        .getAllByRole("link")
        .map((l) => l.textContent)
    ).toEqual(["Leadership", "Radio", "Space"]);
  });

  it("tapping another section swaps the sheet without closing first", async () => {
    const { nav } = renderBar("staff");
    await userEvent.click(within(nav).getByRole("button", { name: "Cadets" }));
    await userEvent.click(within(nav).getByRole("button", { name: "Comms" }));
    expect(screen.queryByRole("dialog", { name: "Cadets" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Comms" })).toBeInTheDocument();
  });

  it.each([
    [
      "tapping the same tab again",
      async (nav: HTMLElement) => {
        await userEvent.click(within(nav).getByRole("button", { name: "Cadets" }));
      },
    ],
    [
      "Escape",
      async () => {
        await userEvent.keyboard("{Escape}");
      },
    ],
    [
      "tapping a page in it",
      async () => {
        await userEvent.click(screen.getByRole("link", { name: "Events" }));
      },
    ],
  ])("%s closes the sheet", async (_how, close) => {
    const { nav } = renderBar("staff");
    await userEvent.click(within(nav).getByRole("button", { name: "Cadets" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await close(nav);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Cadets" })).toHaveAttribute("aria-expanded", "false");
  });

  it("navigating away closes the sheet, the back button included", async () => {
    const { nav, rerender } = renderBar("staff", "/");
    await userEvent.click(within(nav).getByRole("button", { name: "Data" }));
    pathname.current = "/cadets/overview";
    await act(async () => rerender(<Harness />));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("OC pages only show in the OC's Home sheet", async () => {
    const { nav, unmount } = renderBar("staff");
    await userEvent.click(within(nav).getByRole("button", { name: "Home" }));
    expect(screen.queryByRole("link", { name: "Leaving Process" })).not.toBeInTheDocument();
    unmount();

    const oc = renderBar("staff", "/", { is_oc: true });
    await userEvent.click(within(oc.nav).getByRole("button", { name: "Home" }));
    expect(screen.getByRole("link", { name: "Leaving Process" })).toHaveAttribute("href", "/oc/leaving");
  });

  it("Menu opens the full sidebar and closes any open sheet", async () => {
    const { nav } = renderBar("nco");
    await userEvent.click(within(nav).getByRole("button", { name: "Cadets" }));
    const menu = within(nav).getByRole("button", { name: "Menu" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(menu);
    expect(screen.getByRole("status", { name: "sidebar" })).toHaveTextContent("open");
    expect(screen.queryByRole("dialog", { name: "Cadets" })).not.toBeInTheDocument();
  });

  it("stays out of print and off wider screens", () => {
    const { nav } = renderBar("staff");
    expect(nav).toHaveClass("no-print", "md:hidden");
  });
});
