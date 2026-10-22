// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = vi.hoisted(() => ({
  current: { data: { role: "staff" } as { role?: string }, status: "authenticated" },
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

function renderBar(role: string | undefined, path = "/") {
  SESSION.current = { data: { role }, status: "authenticated" };
  pathname.current = path;
  render(
    <SidebarProvider>
      <MobileTabBar />
      <SidebarState />
    </SidebarProvider>
  );
  return screen.getByRole("navigation", { name: "Quick links" });
}

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
    ["staff", ["Home", "Cadets", "Marking", "Orders", "More"]],
    ["snco", ["Home", "Marking", "Plans", "Results", "More"]],
    ["nco", ["Home", "Marking", "Plans", "Results", "More"]],
  ])("%s gets their tabs, then More", (role, labels) => {
    const nav = renderBar(role);
    expect(
      within(nav)
        .getAllByRole("listitem")
        .map((li) => li.textContent)
    ).toEqual(labels);
  });

  it("marks the current section, and only that one", () => {
    const nav = renderBar("staff", "/stores/badges/orders");
    expect(within(nav).getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("marks nothing on a page that lives under More", () => {
    const nav = renderBar("staff", "/texts/messages");
    expect(within(nav).queryByRole("link", { current: "page" })).not.toBeInTheDocument();
  });

  it("an NCO's marking tab goes to a sheet they can use", () => {
    const nav = renderBar("nco");
    expect(within(nav).getByRole("link", { name: "Marking" })).toHaveAttribute(
      "href",
      "/assessments/leadership"
    );
  });

  it("More opens the full menu", async () => {
    const nav = renderBar("nco");
    const more = within(nav).getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(more);
    expect(screen.getByRole("status", { name: "sidebar" })).toHaveTextContent("open");
  });

  it("before the session loads there's just Home and More, nothing to bounce off", () => {
    const nav = renderBar(undefined);
    expect(
      within(nav)
        .getAllByRole("listitem")
        .map((li) => li.textContent)
    ).toEqual(["Home", "More"]);
  });

  it("stays out of print and off wider screens", () => {
    const nav = renderBar("staff");
    expect(nav).toHaveClass("no-print", "md:hidden");
  });
});
