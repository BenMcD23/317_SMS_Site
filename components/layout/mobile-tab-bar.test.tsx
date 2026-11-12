// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = vi.hoisted(() => ({
  current: { data: { role: "staff" } as { role?: string }, status: "authenticated" },
}));
vi.mock("next-auth/react", () => ({ useSession: () => SESSION.current }));
const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { SidebarProvider } from "@/components/ui/sidebar";

function renderBar(role: string | undefined, path = "/") {
  SESSION.current = { data: { role }, status: "authenticated" };
  pathname.current = path;
  render(
    <SidebarProvider>
      <MobileTabBar />
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
    ["staff", ["Home", "Cadets", "Parade Night", "Stores", "More"]],
    ["snco", ["Home", "Parade Night", "NCO Team", "More"]],
    ["nco", ["Home", "Parade Night", "NCO Team", "More"]],
  ])("%s gets Home, their main sections and More, all plain links", (role, expected) => {
    const nav = renderBar(role);
    expect(
      within(nav)
        .getAllByRole("link")
        .map((l) => l.textContent)
    ).toEqual(expected);
    expect(within(nav).queryByRole("button")).not.toBeInTheDocument();
  });

  it("a section tab opens its hub", () => {
    const nav = renderBar("staff");
    expect(within(nav).getByRole("link", { name: "Stores" })).toHaveAttribute("href", "/m/stores");
    expect(within(nav).getByRole("link", { name: "More" })).toHaveAttribute("href", "/m/more");
  });

  it("lights the section on any page in it, and only that one", () => {
    const nav = renderBar("staff", "/stores/badges/orders");
    expect(within(nav).getByRole("link", { name: "Stores" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "More" })).not.toHaveAttribute("aria-current");
  });

  it("lights More on a page whose section isn't on the bar", () => {
    const nav = renderBar("staff", "/texts/messages");
    expect(within(nav).getByRole("link", { name: "More" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getAllByRole("link", { current: "page" })).toHaveLength(1);
  });

  it("lights only Home on Home", () => {
    const nav = renderBar("nco", "/");
    expect(
      within(nav)
        .getAllByRole("link", { current: "page" })
        .map((l) => l.textContent)
    ).toEqual(["Home"]);
  });

  it("before the session loads there's just Home and More, nothing to bounce off", () => {
    const nav = renderBar(undefined);
    expect(
      within(nav)
        .getAllByRole("link")
        .map((l) => l.textContent)
    ).toEqual(["Home", "More"]);
  });

  it("stays out of print and off wider screens", () => {
    const nav = renderBar("staff");
    expect(nav).toHaveClass("no-print", "md:hidden");
  });
});
