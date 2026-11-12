// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = vi.hoisted(() => ({ current: { data: { role: "staff", id_token: "t" } as object } }));
vi.mock("next-auth/react", () => ({ useSession: () => SESSION.current }));
const nav = vi.hoisted(() => ({ path: "/", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ push: nav.push }),
}));

import { CommandPalette } from "@/components/layout/command-palette";
import { resetQuickPagesForTest } from "@/lib/quick-pages";

const PINS = "sms.mobile.pins";
const RECENT = "sms.mobile.recent";

function renderPalette(path = "/") {
  nav.path = path;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CommandPalette open onOpenChange={() => {}} />
    </QueryClientProvider>
  );
  return screen.getByRole("dialog");
}

/** The palette's group headings, in order. */
const groupNames = (dialog: HTMLElement) =>
  [...dialog.querySelectorAll("[cmdk-group-heading]")].map((h) => h.textContent);
/** The options under one heading. */
const groupOptions = (dialog: HTMLElement, heading: string) => {
  const group = [...dialog.querySelectorAll("[cmdk-group]")].find(
    (g) => g.querySelector("[cmdk-group-heading]")?.textContent === heading
  ) as HTMLElement;
  return within(group).getAllByRole("option");
};

beforeEach(() => {
  window.localStorage.clear();
  resetQuickPagesForTest();
  nav.push.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

describe("⌘K with nothing typed", () => {
  it("lists the pages used last first, not the one you're on", () => {
    window.localStorage.setItem(RECENT, JSON.stringify(["/texts/messages", "/stores/badges/orders"]));
    const dialog = renderPalette("/texts/messages");
    expect(groupNames(dialog)[0]).toBe("Recent");
    const recent = within(dialog).getAllByRole("group")[0];
    expect(
      within(recent)
        .getAllByRole("option")
        .map((o) => o.textContent)
    ).toEqual(["Badges OrdersStores › Badges"]);
  });

  it("goes to a recent page when picked", async () => {
    window.localStorage.setItem(RECENT, JSON.stringify(["/stores/badges/orders"]));
    const dialog = renderPalette("/");
    await userEvent.click(groupOptions(dialog, "Recent")[0]);
    expect(nav.push).toHaveBeenCalledWith("/stores/badges/orders");
  });

  it("drops Recent once you start typing", async () => {
    window.localStorage.setItem(RECENT, JSON.stringify(["/stores/badges/orders"]));
    const dialog = renderPalette("/");
    await userEvent.type(within(dialog).getByRole("combobox"), "stock");
    expect(groupNames(dialog)).not.toContain("Recent");
  });

  it("has no Recent group before anything's been visited", () => {
    const dialog = renderPalette("/");
    expect(groupNames(dialog)).not.toContain("Recent");
  });
});

describe("pinning the page you're on", () => {
  it("pins it to the menu", async () => {
    window.localStorage.setItem(PINS, JSON.stringify(["/"]));
    const dialog = renderPalette("/texts/messages");
    await userEvent.click(within(dialog).getByRole("option", { name: "Pin Parade Night Texts to the menu" }));
    expect(JSON.parse(window.localStorage.getItem(PINS)!)).toEqual(["/", "/texts/messages"]);
  });

  it("unpins it when it's pinned", async () => {
    window.localStorage.setItem(PINS, JSON.stringify(["/", "/texts/messages"]));
    const dialog = renderPalette("/texts/messages");
    await userEvent.click(within(dialog).getByRole("option", { name: "Unpin Parade Night Texts" }));
    expect(JSON.parse(window.localStorage.getItem(PINS)!)).toEqual(["/"]);
  });

  it("doesn't offer a fifth pin, or a pin for a page the menu doesn't list", () => {
    // The staff defaults fill all four.
    let dialog = renderPalette("/texts/messages");
    expect(within(dialog).queryByRole("option", { name: /Pin Parade Night Texts/ })).not.toBeInTheDocument();
    cleanup();
    window.localStorage.setItem(PINS, JSON.stringify(["/"]));
    dialog = renderPalette("/settings");
    expect(within(dialog).queryByRole("option", { name: /to the menu/ })).not.toBeInTheDocument();
  });
});
