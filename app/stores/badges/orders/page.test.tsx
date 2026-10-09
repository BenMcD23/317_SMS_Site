// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BadgeOrdersPage from "@/app/stores/badges/orders/page";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { BadgeOrder, BadgeOrderItem } from "@/lib/stores-types";

// One stable object, like the real hook — pages key effects on `session`.
const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk", name: "Sam Staff" } },
  status: "authenticated",
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/stores/badges/orders",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/reference", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reference")>()),
  useReference: () => ({ gainedWhereOptions: [], badgeCategories: [] }),
}));

function item(id: string, badgeName: string, extra: Partial<BadgeOrderItem> = {}): BadgeOrderItem {
  return { id, badgeName, qmNotes: [], givenAt: null, givenBy: null, readyToCollect: null, ...extra };
}

const GIVEN = { givenAt: "2026-10-01T18:00:00Z", givenBy: "Sam Staff" };

function orders(): BadgeOrder[] {
  return [
    {
      id: "1",
      cadetName: "Alex Smith",
      cadetCin: 101,
      timestamp: "2026-09-01T10:00:00Z",
      items: [item("11", "First Aid – Blue"), item("12", "Leadership – Bronze"), item("13", "Squadron")],
    },
    {
      id: "2",
      cadetName: "Bella Jones",
      cadetCin: 102,
      timestamp: "2026-09-02T10:00:00Z",
      items: [item("21", "First Aid – Bronze", GIVEN)],
    },
  ];
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

// Keys are "METHOD path", matched exactly. A fresh Response per call.
function stubApi(over: Record<string, Handler> = {}) {
  const routes: Record<string, Handler> = {
    "GET /api/stores/badges/orders": () => json(orders()),
    "GET /api/stores/badges": () => json({ config: { numRows: 1, numCols: 1 }, cells: [] }),
    "GET /api/stores/badges/order-lists": () => json([]),
    ...over,
  };
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    const res = await (routes[key] ? routes[key](url, init) : json({ detail: `not stubbed: ${key}` }, 404));
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
    render(
      <TooltipProvider>
        <BadgeOrdersPage />
      </TooltipProvider>
    );
  });
  await screen.findByText("Alex Smith");
}

const card = (cadet: string) => screen.getByText(cadet).closest("[data-exit-id]") as HTMLElement;
const expand = (cadet: string) =>
  act(async () => screen.getByRole("button", { name: `Expand order for ${cadet}` }).click());
const confirmDialog = () =>
  act(async () => within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }).click());
const search = (q: string) =>
  act(async () => {
    fireEvent.change(screen.getByRole("textbox", { name: "Search by cadet or badge" }), {
      target: { value: q },
    });
  });

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

describe("acting on a badge doesn't reload the page", () => {
  it("Ready to Collect updates the badge in place from the API's answer, without refetching", async () => {
    const fetch = stubApi({
      "POST /api/stores/badges/orders/1/items/11/mark-ready": () => {
        const updated = orders()[0];
        updated.items[0].readyToCollect = "2026-10-08T18:00:00Z";
        return json(updated);
      },
    });
    await renderPage();
    await expand("Alex Smith");
    const before = card("Alex Smith");

    await act(async () => screen.getAllByRole("button", { name: "Ready to Collect" })[0].click());

    expect(await screen.findByText(/Cadet notified/)).toBeInTheDocument();
    expect(calls(fetch, "GET /api/stores/badges/orders")).toBe(1);
    expect(card("Alex Smith")).toBe(before);
    expect(screen.getByRole("button", { name: "Collapse order for Alex Smith" })).toBeInTheDocument();
  });

  it("a failed Ready to Collect shows the error and leaves the badge as it was", async () => {
    stubApi({ "POST /api/stores/badges/orders/1/items/11/mark-ready": () => json({ detail: "boom" }, 500) });
    await renderPage();
    await expand("Alex Smith");

    await act(async () => screen.getAllByRole("button", { name: "Ready to Collect" })[0].click());

    expect(await screen.findByText("Failed to mark as ready to collect")).toBeInTheDocument();
    expect(screen.queryByText(/Cadet notified/)).not.toBeInTheDocument();
  });
});

describe("orders leaving the list", () => {
  it("a deleted order collapses out, then is gone", async () => {
    stubApi({ "DELETE /api/stores/badges/orders/1": () => new Response(null, { status: 204 }) });
    await renderPage();
    await expand("Alex Smith");

    await act(async () => screen.getAllByRole("button", { name: "Delete Order" })[0].click());
    await confirmDialog();

    expect(card("Alex Smith")).toHaveClass("grid-rows-[0fr]");
    await waitFor(() => expect(screen.queryByText("Alex Smith")).not.toBeInTheDocument());
    expect(screen.getByText("Bella Jones")).toBeInTheDocument();
  });

  it("a failed delete keeps the order and says so", async () => {
    stubApi({ "DELETE /api/stores/badges/orders/1": () => json({ detail: "nope" }, 500) });
    await renderPage();
    await expand("Alex Smith");

    await act(async () => screen.getAllByRole("button", { name: "Delete Order" })[0].click());
    await confirmDialog();

    expect(await screen.findByText("Failed to delete order")).toBeInTheDocument();
    expect(card("Alex Smith")).toHaveClass("grid-rows-[1fr]");
  });

  it("a completed order collapses out of Active and turns up under Completed", async () => {
    stubApi({ "PATCH /api/stores/badges/orders/2": () => json({ ...orders()[1], completed: true }) });
    await renderPage();
    await expand("Bella Jones");

    await act(async () => screen.getByRole("button", { name: "Complete Order" }).click());
    await confirmDialog();

    expect(card("Bella Jones")).toHaveClass("grid-rows-[0fr]");
    await waitFor(() => expect(screen.queryByText("Bella Jones")).not.toBeInTheDocument());

    await act(async () => screen.getByRole("button", { name: /^Completed/ }).click());
    expect(screen.getByText("Bella Jones")).toBeInTheDocument();
  });

  it("marking a badge given updates the order where it is", async () => {
    stubApi({
      "PATCH /api/stores/badges/orders/1": (_url, init) => {
        const sent = JSON.parse(String(init?.body)) as Partial<BadgeOrder>;
        return json({ ...orders()[0], items: sent.items });
      },
    });
    await renderPage();
    await expand("Alex Smith");
    const before = card("Alex Smith");

    await act(async () => screen.getAllByRole("button", { name: "Mark as Given" })[0].click());
    await act(async () =>
      within(screen.getByRole("dialog")).getByRole("button", { name: "Mark as Given" }).click()
    );

    expect(await screen.findByText(/Given .* · Sam Staff/)).toBeInTheDocument();
    expect(card("Alex Smith")).toBe(before);
    expect(card("Alex Smith")).toHaveClass("grid-rows-[1fr]");
  });
});

describe("search", () => {
  it("searching a badge shows only that badge in each order", async () => {
    stubApi();
    await renderPage();
    await search("first aid");

    expect(within(card("Alex Smith")).getByText("1 of 3 items")).toBeInTheDocument();
    expect(screen.getByText("Bella Jones")).toBeInTheDocument();

    await expand("Alex Smith");
    const alex = within(card("Alex Smith"));
    expect(alex.getByText("First Aid – Blue")).toBeInTheDocument();
    expect(alex.queryByText("Leadership – Bronze")).not.toBeInTheDocument();
    expect(alex.queryByText("Squadron")).not.toBeInTheDocument();
    expect(alex.getByText("Showing 1 of 3 badges matching your search.")).toBeInTheDocument();
  });

  it("a filtered order still can't be completed while hidden badges are ungiven", async () => {
    // Bella's badges are all given; Alex's search hit is the only one we can see,
    // but the two hidden ones still block completion.
    stubApi();
    await renderPage();
    await search("leadership");
    await expand("Alex Smith");
    expect(within(card("Alex Smith")).getByRole("button", { name: "Complete Order" })).toBeDisabled();
  });

  it("searching a cadet's name shows their whole order", async () => {
    stubApi();
    await renderPage();
    await search("smith");

    expect(screen.queryByText("Bella Jones")).not.toBeInTheDocument();
    await expand("Alex Smith");
    const alex = within(card("Alex Smith"));
    for (const name of ["First Aid – Blue", "Leadership – Bronze", "Squadron"]) {
      expect(alex.getByText(name)).toBeInTheDocument();
    }
  });

  it("a search nothing matches says so", async () => {
    stubApi();
    await renderPage();
    await search("gliding");
    expect(screen.getByText("No orders match your search.")).toBeInTheDocument();
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

  it("when the orders fail to load there's nothing to expand", async () => {
    stubApi({ "GET /api/stores/badges/orders": () => json({ detail: "down" }, 500) });
    await act(async () => {
      render(
        <TooltipProvider>
          <BadgeOrdersPage />
        </TooltipProvider>
      );
    });
    expect(
      await screen.findByText(/Failed to load: \/api\/stores\/badges\/orders → 500/)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand all" })).toBeDisabled();
  });
});

describe("Blue Flying stages", () => {
  const STAGES = [
    { stage: 1, name: "Blue aviation (ATP ground school)", done: true },
    { stage: 2, name: "Blue PTT (simulator)", done: false },
    { stage: 3, name: "Flight in a Grob Tutor or Viking", done: true },
  ];
  const flyingOrder = (qualHeld: boolean, qualStages = STAGES) => [
    {
      id: "1",
      cadetName: "Alex Smith",
      cadetCin: 101,
      timestamp: "2026-09-01T10:00:00Z",
      items: [item("11", "Flying – Blue", { qualHeld, qualStages })],
    },
  ];

  it("says which stage is missing when Blue Flying isn't held", async () => {
    stubApi({ "GET /api/stores/badges/orders": () => json(flyingOrder(false)) });
    await renderPage();
    await expand("Alex Smith");
    expect(within(card("Alex Smith")).getByText("Missing stage 2: Blue PTT (simulator)")).toBeTruthy();
  });

  it("says nothing about stages once it's held", async () => {
    stubApi({
      "GET /api/stores/badges/orders": () =>
        json(
          flyingOrder(
            true,
            STAGES.map((s) => ({ ...s, done: true }))
          )
        ),
    });
    await renderPage();
    await expand("Alex Smith");
    expect(within(card("Alex Smith")).getByText("Qualification is held")).toBeTruthy();
    expect(within(card("Alex Smith")).queryByText(/Missing stage/)).toBeNull();
  });
});
