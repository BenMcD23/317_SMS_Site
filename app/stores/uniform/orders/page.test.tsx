// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OrdersPage from "@/app/stores/uniform/orders/page";
import type { Order, OrderItem } from "@/lib/stores-types";

// One stable object, like the real hook — pages key effects on `session`.
const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk", name: "Sam Staff" } },
  status: "authenticated",
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/stores/uniform/orders",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/reference", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reference")>()),
  useReference: () => ({ itemTypes: ["Beret", "Tie", "Belt"], noSizeItems: new Set(["Tie", "Belt"]) }),
}));

function item(id: string, itemType: string, extra: Partial<OrderItem> = {}): OrderItem {
  return {
    id,
    itemType,
    size: itemType === "Beret" ? "56" : "",
    needSizing: false,
    sizingDetails: "",
    qmNotes: [],
    givenAt: null,
    givenBy: null,
    readyToCollect: null,
    ...extra,
  };
}

function orders(): (Order & { subjectType: string })[] {
  return [
    {
      id: "1",
      cadetName: "Alex Smith",
      cadetCin: 101,
      subjectType: "cadet",
      timestamp: "2026-09-01T10:00:00Z",
      items: [item("11", "Beret"), item("12", "Tie"), item("13", "Belt")],
    },
    {
      id: "2",
      cadetName: "Bella Jones",
      cadetCin: 102,
      subjectType: "cadet",
      timestamp: "2026-09-02T10:00:00Z",
      items: [item("21", "Tie")],
    },
    {
      id: "3",
      cadetName: "Kit Cadet",
      cadetCin: 103,
      subjectType: "cadet",
      timestamp: "2026-09-03T10:00:00Z",
      kitting: true,
      items: [item("31", "Belt")],
    },
  ];
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

// Keys are "METHOD path", matched exactly (query strings aside). A fresh Response per call.
function stubApi(over: Record<string, Handler> = {}) {
  const routes: Record<string, Handler> = {
    "GET /api/stores/orders": () => json(orders()),
    "GET /api/stores/stock": () => json([]),
    "GET /api/stores/logs-forms": () => json([]),
    ...over,
  };
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(url).split("?")[0]}`;
    const res = await (routes[key]
      ? routes[key](String(url), init)
      : json({ detail: `not stubbed: ${key}` }, 404));
    // A real Response knows its URL; loadError names the failing path from it.
    Object.defineProperty(res, "url", { value: `http://localhost${url}` });
    return res;
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const calls = (fetch: ReturnType<typeof stubApi>, key: string) =>
  fetch.mock.calls.filter(([url, init]) => `${init?.method ?? "GET"} ${url}` === key).length;

async function renderPage() {
  await act(async () => {
    render(<OrdersPage />);
  });
  await screen.findByText("Alex Smith");
}

const card = (cadet: string) => screen.getByText(cadet).closest("[data-exit-id]") as HTMLElement;
const expand = (cadet: string) =>
  act(async () => screen.getByRole("button", { name: `Expand order for ${cadet}` }).click());
const confirmDialog = () =>
  act(async () => within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }).click());

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("acting on an item doesn't reload the page", () => {
  it("Ready to Collect updates the item in place from the API's answer, without refetching", async () => {
    const fetch = stubApi({
      "POST /api/stores/orders/1/items/11/mark-ready": () => {
        const updated = orders()[0];
        updated.items[0].readyToCollect = "2026-10-08T18:00:00Z";
        return json(updated);
      },
    });
    await renderPage();
    await expand("Alex Smith");
    const before = card("Alex Smith");

    await act(async () => screen.getAllByRole("button", { name: "Ready to Collect" })[0].click());

    expect(await screen.findByRole("button", { name: "Notified" })).toBeDisabled();
    expect(calls(fetch, "GET /api/stores/orders")).toBe(1);
    // Same DOM node, still expanded — nothing was torn down and rebuilt.
    expect(card("Alex Smith")).toBe(before);
    expect(screen.getByRole("button", { name: "Collapse order for Alex Smith" })).toBeInTheDocument();
  });

  it("Mark as Given keeps every card on screen while it refreshes the orders", async () => {
    let releaseReload: () => void = () => {};
    let ordersLoads = 0;
    const fetch = stubApi({
      "POST /api/stores/issuances/101": () => json([]),
      "GET /api/stores/orders": () => {
        ordersLoads += 1;
        if (ordersLoads === 1) return json(orders());
        const updated = orders();
        updated[0].items[0].givenAt = "2026-10-08T18:00:00Z";
        updated[0].items[0].givenBy = "Sam Staff";
        // Hold the reload open so we can look at the page mid-refresh.
        return new Promise<Response>((resolve) => {
          releaseReload = () => resolve(json(updated));
        });
      },
    });
    await renderPage();
    await expand("Alex Smith");
    const before = card("Alex Smith");

    await act(async () => screen.getAllByRole("button", { name: "Mark as Given" })[0].click());
    await act(async () =>
      within(screen.getByRole("dialog")).getByRole("button", { name: "Mark as Given" }).click()
    );

    // Mid-refresh: the old page is still there, not a wall of skeletons.
    expect(calls(fetch, "GET /api/stores/orders")).toBe(2);
    expect(card("Alex Smith")).toBe(before);
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();

    await act(async () => releaseReload());
    expect(await screen.findByText(/Given .* · Sam Staff/)).toBeInTheDocument();
    expect(card("Alex Smith")).toBe(before);
    expect(screen.getByRole("button", { name: "Collapse order for Alex Smith" })).toBeInTheDocument();
  });

  it("a failed Ready to Collect shows the error and leaves the item as it was", async () => {
    stubApi({ "POST /api/stores/orders/1/items/11/mark-ready": () => json({ detail: "boom" }, 500) });
    await renderPage();
    await expand("Alex Smith");

    await act(async () => screen.getAllByRole("button", { name: "Ready to Collect" })[0].click());

    expect(await screen.findByText("Failed to mark as ready to collect")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notified" })).not.toBeInTheDocument();
    expect(screen.getByText("Alex Smith")).toBeInTheDocument();
  });

  it("a failed quiet refresh after Mark as Given reports the error but keeps the orders shown", async () => {
    let ordersLoads = 0;
    stubApi({
      "POST /api/stores/issuances/101": () => json([]),
      "GET /api/stores/orders": () => (++ordersLoads === 1 ? json(orders()) : json({ detail: "down" }, 503)),
    });
    await renderPage();
    await expand("Alex Smith");

    await act(async () => screen.getAllByRole("button", { name: "Mark as Given" })[0].click());
    await act(async () =>
      within(screen.getByRole("dialog")).getByRole("button", { name: "Mark as Given" }).click()
    );

    expect(await screen.findByText(/Failed to load: \/api\/stores\/orders → /)).toBeInTheDocument();
    expect(screen.getByText("Alex Smith")).toBeInTheDocument();
  });
});

describe("orders leaving the list", () => {
  it("a deleted order collapses out, then is gone", async () => {
    stubApi({ "DELETE /api/stores/orders/1": () => new Response(null, { status: 204 }) });
    await renderPage();
    await expand("Alex Smith");

    await act(async () => screen.getByRole("button", { name: "Delete Order" }).click());
    await confirmDialog();

    expect(card("Alex Smith")).toHaveClass("grid-rows-[0fr]");
    await waitFor(() => expect(screen.queryByText("Alex Smith")).not.toBeInTheDocument());
    expect(screen.getByText("Bella Jones")).toBeInTheDocument();
  });

  it("a failed delete keeps the order and says so", async () => {
    stubApi({ "DELETE /api/stores/orders/1": () => json({ detail: "nope" }, 500) });
    await renderPage();
    await expand("Alex Smith");

    await act(async () => screen.getByRole("button", { name: "Delete Order" }).click());
    await confirmDialog();

    expect(await screen.findByText("Failed to delete order")).toBeInTheDocument();
    expect(card("Alex Smith")).toHaveClass("grid-rows-[1fr]");
  });

  it("a completed order collapses out of Active and turns up under Completed", async () => {
    stubApi({
      "PATCH /api/stores/orders/1": () => json({ ...orders()[0], completed: true }),
    });
    await renderPage();
    await expand("Alex Smith");

    await act(async () => screen.getByRole("button", { name: "Complete Order" }).click());
    await confirmDialog();

    expect(card("Alex Smith")).toHaveClass("grid-rows-[0fr]");
    await waitFor(() => expect(screen.queryByText("Alex Smith")).not.toBeInTheDocument());

    // Radix tabs switch on mousedown (and keyboard), not a synthetic click.
    await act(async () => fireEvent.mouseDown(screen.getByRole("tab", { name: /^Completed/ })));
    expect(screen.getByText("Alex Smith")).toBeInTheDocument();
  });

  it("completing a kitting order keeps it on the kitting tab instead of collapsing it", async () => {
    stubApi({
      "PATCH /api/stores/orders/3": () => json({ ...orders()[2], completed: true }),
    });
    await renderPage();
    // Radix tabs switch on mousedown (and keyboard), not a synthetic click.
    await act(async () => fireEvent.mouseDown(screen.getByRole("tab", { name: /^C Flight Kitting/ })));
    await expand("Kit Cadet");

    await act(async () => screen.getByRole("button", { name: "Complete Order" }).click());
    await confirmDialog();

    expect(await screen.findByRole("button", { name: "Reopen Order" })).toBeInTheDocument();
    expect(card("Kit Cadet")).toHaveClass("grid-rows-[1fr]");
  });

  it("a failed complete leaves the order where it was", async () => {
    stubApi({ "PATCH /api/stores/orders/1": () => json({ detail: "nope" }, 500) });
    await renderPage();
    await expand("Alex Smith");

    await act(async () => screen.getByRole("button", { name: "Complete Order" }).click());
    await confirmDialog();

    expect(await screen.findByText("Failed to update order")).toBeInTheDocument();
    expect(card("Alex Smith")).toHaveClass("grid-rows-[1fr]");
  });
});

describe("search", () => {
  const search = (q: string) =>
    act(async () => {
      fireEvent.change(screen.getByRole("textbox", { name: "Search by cadet or item" }), {
        target: { value: q },
      });
    });

  it("searching an item shows only that item in each order", async () => {
    stubApi();
    await renderPage();
    await search("tie");

    expect(screen.getByText("Alex Smith")).toBeInTheDocument();
    expect(screen.getByText("Bella Jones")).toBeInTheDocument();
    expect(within(card("Alex Smith")).getByText("1 of 3 items")).toBeInTheDocument();

    await expand("Alex Smith");
    const alex = within(card("Alex Smith"));
    expect(alex.getByText("Tie")).toBeInTheDocument();
    expect(alex.queryByText("Beret")).not.toBeInTheDocument();
    expect(alex.queryByText("Belt")).not.toBeInTheDocument();
    expect(alex.getByText("Showing 1 of 3 items matching your search.")).toBeInTheDocument();
  });

  it("searching a cadet's name shows their whole order", async () => {
    stubApi();
    await renderPage();
    await search("alex");

    expect(screen.queryByText("Bella Jones")).not.toBeInTheDocument();
    await expand("Alex Smith");
    const alex = within(card("Alex Smith"));
    for (const type of ["Beret", "Tie", "Belt"]) expect(alex.getByText(type)).toBeInTheDocument();
    expect(alex.queryByText(/matching your search/)).not.toBeInTheDocument();
  });

  it("a search nothing matches says so", async () => {
    stubApi();
    await renderPage();
    await search("wedgewood");
    expect(screen.getByText("No orders match your search.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand all" })).toBeDisabled();
  });
});

describe("expand all", () => {
  it("expands every order on the tab, then collapses them again", async () => {
    stubApi();
    await renderPage();

    await act(async () => screen.getByRole("button", { name: "Expand all" }).click());
    expect(screen.getByRole("button", { name: "Collapse order for Alex Smith" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse order for Bella Jones" })).toBeInTheDocument();

    await act(async () => screen.getByRole("button", { name: "Collapse all" }).click());
    expect(screen.getByRole("button", { name: "Expand order for Alex Smith" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand order for Bella Jones" })).toBeInTheDocument();
  });

  it("only expands the orders the search is showing", async () => {
    stubApi();
    await renderPage();
    await act(async () => {
      fireEvent.change(screen.getByRole("textbox", { name: "Search by cadet or item" }), {
        target: { value: "beret" },
      });
    });
    await act(async () => screen.getByRole("button", { name: "Expand all" }).click());
    await act(async () => {
      fireEvent.change(screen.getByRole("textbox", { name: "Search by cadet or item" }), {
        target: { value: "" },
      });
    });

    expect(screen.getByRole("button", { name: "Collapse order for Alex Smith" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand order for Bella Jones" })).toBeInTheDocument();
  });

  it("when the orders fail to load the button has nothing to expand", async () => {
    stubApi({ "GET /api/stores/orders": () => json({ detail: "down" }, 500) });
    await act(async () => {
      render(<OrdersPage />);
    });
    expect(await screen.findByText(/Failed to load: \/api\/stores\/orders → /)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand all" })).toBeDisabled();
  });
});
