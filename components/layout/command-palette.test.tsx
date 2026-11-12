// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = vi.hoisted(() => ({ current: { data: { role: "staff", id_token: "t" } as object } }));
vi.mock("next-auth/react", () => ({ useSession: () => SESSION.current }));
const nav = vi.hoisted(() => ({ path: "/", push: vi.fn() }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));
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

/**
 * A fake API for the account's pins: `account` is what it holds (null = never
 * chosen). `failSave` makes a PUT fail. Records each PUT's body.
 */
function fakeAccount(account: string[] | null, { failSave = false } = {}) {
  const saved: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (String(url).endsWith("/settings/nav-pins")) {
        if (init.method === "PUT") {
          if (failSave) return new Response(JSON.stringify({ detail: "down" }), { status: 503 });
          const body = JSON.parse(String(init.body));
          saved.push(body.pins);
          account = body.pins;
          return new Response(JSON.stringify({ pins: account }), { status: 200 });
        }
        return new Response(JSON.stringify({ pins: account }), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    })
  );
  return { saved };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  window.localStorage.clear();
  fakeAccount(null);
  resetQuickPagesForTest();
  nav.push.mockClear();
  toastError.mockClear();
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

  it("offers a pin however many there are, but not for a page the menu doesn't list", () => {
    // The staff defaults are four already.
    let dialog = renderPalette("/texts/messages");
    expect(
      within(dialog).getByRole("option", { name: "Pin Parade Night Texts to the menu" })
    ).toBeInTheDocument();
    cleanup();
    window.localStorage.setItem(PINS, JSON.stringify(["/"]));
    dialog = renderPalette("/settings");
    expect(within(dialog).queryByRole("option", { name: /to the menu/ })).not.toBeInTheDocument();
  });
});

describe("pins on the account", () => {
  it("are what the menu shows, wherever they were made", async () => {
    window.localStorage.setItem(PINS, JSON.stringify(["/"]));
    fakeAccount(["/texts/messages", "/stats"]);
    renderPalette("/texts/messages");
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem(PINS)!)).toEqual(["/texts/messages", "/stats"])
    );
    expect(screen.getByRole("option", { name: "Unpin Parade Night Texts" })).toBeInTheDocument();
  });

  it("are saved when a page is pinned", async () => {
    const api = fakeAccount(["/"]);
    const dialog = renderPalette("/texts/messages");
    await act(settle);
    await userEvent.click(within(dialog).getByRole("option", { name: "Pin Parade Night Texts to the menu" }));
    await waitFor(() => expect(api.saved).toEqual([["/", "/texts/messages"]]));
  });

  it("take up pins this browser made before they were kept on the account", async () => {
    window.localStorage.setItem(PINS, JSON.stringify(["/", "/stats"]));
    const api = fakeAccount(null);
    renderPalette("/");
    await waitFor(() => expect(api.saved).toEqual([["/", "/stats"]]));
    expect(JSON.parse(window.localStorage.getItem(PINS)!)).toEqual(["/", "/stats"]);
  });

  it("put a pin back and say so when it can't be saved", async () => {
    fakeAccount(["/"], { failSave: true });
    const dialog = renderPalette("/texts/messages");
    await act(settle);
    await userEvent.click(within(dialog).getByRole("option", { name: "Pin Parade Night Texts to the menu" }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(PINS)!)).toEqual(["/"]));
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/Couldn't save your pins/));
  });

  it("keep this browser's copy when the account can't be reached", async () => {
    window.localStorage.setItem(PINS, JSON.stringify(["/", "/stats"]));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    renderPalette("/");
    await act(settle);
    expect(JSON.parse(window.localStorage.getItem(PINS)!)).toEqual(["/", "/stats"]);
  });
});
