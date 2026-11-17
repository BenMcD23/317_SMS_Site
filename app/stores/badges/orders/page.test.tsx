// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BadgeOrdersPage from "@/app/stores/badges/orders/page";
import { renderWithQuery } from "@/tests/render-with-query";
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
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast, Toaster: () => null }));
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
    renderWithQuery(
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
// The item's "⋯" menu and the tick that hands it out.
const openMenu = (cadet: string, badge: string) =>
  userEvent.click(within(card(cadet)).getByRole("button", { name: `More for ${badge}` }));
const pick = (label: string) => userEvent.click(screen.getByRole("menuitem", { name: label }));
const tick = (cadet: string, badge: string) =>
  within(card(cadet)).getByRole("checkbox", { name: `Given: ${badge}` });
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
  it("Ready to collect, from the badge's menu, updates it in place from the API's answer", async () => {
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

    await openMenu("Alex Smith", "First Aid – Blue");
    await pick("Ready to collect");

    expect(await within(card("Alex Smith")).findByText("Ready to collect")).toBeInTheDocument();
    expect(calls(fetch, "GET /api/stores/badges/orders")).toBe(1);
    expect(card("Alex Smith")).toBe(before);
    expect(screen.getByRole("button", { name: "Collapse order for Alex Smith" })).toBeInTheDocument();
  });

  it("a failed Ready to collect shows the error and leaves the badge as it was", async () => {
    stubApi({ "POST /api/stores/badges/orders/1/items/11/mark-ready": () => json({ detail: "boom" }, 500) });
    await renderPage();
    await expand("Alex Smith");

    await openMenu("Alex Smith", "First Aid – Blue");
    await pick("Ready to collect");

    expect(await screen.findByText("Failed to mark as ready to collect")).toBeInTheDocument();
    expect(within(card("Alex Smith")).queryByText("Ready to collect")).toBeNull();
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

    // Radix tabs switch on mousedown (and keyboard), not a synthetic click.
    await act(async () => fireEvent.mouseDown(screen.getByRole("tab", { name: /^Completed/ })));
    expect(screen.getByText("Bella Jones")).toBeInTheDocument();
  });

  it("ticking a badge gives it at once and updates the order where it is", async () => {
    const fetch = stubApi({
      "POST /api/stores/badges/orders/1/items/11/mark-given": () => {
        const updated = orders()[0];
        updated.items[0] = item("11", "First Aid – Blue", {
          givenAt: "2026-10-09T18:00:00Z",
          givenBy: "Sam Staff",
          givenEvents: [{ id: "e1", action: "given", timestamp: "2026-10-09T18:00:00Z", by: "Sam Staff" }],
        });
        return json(updated);
      },
    });
    await renderPage();
    await expand("Alex Smith");
    const before = card("Alex Smith");

    // No confirm first: the tick is the hand-over.
    await act(async () => tick("Alex Smith", "First Aid – Blue").click());
    expect(screen.queryByRole("dialog")).toBeNull();

    expect(await screen.findByText(/Given .* · Sam Staff/)).toBeInTheDocument();
    expect(tick("Alex Smith", "First Aid – Blue")).toHaveAttribute("aria-checked", "true");
    const [, init] = fetch.mock.calls.find(([u]) => String(u).endsWith("/mark-given"))!;
    expect(JSON.parse(String(init?.body))).toEqual({ by: "Sam Staff" });
    expect(calls(fetch, "GET /api/stores/badges/orders")).toBe(1);
    expect(card("Alex Smith")).toBe(before);
    expect(toast).toHaveBeenCalledWith("First Aid – Blue given to Alex Smith", expect.anything());
  });

  it("the toast's Undo takes a tick straight back", async () => {
    const fetch = stubApi({
      "POST /api/stores/badges/orders/1/items/11/mark-given": () => {
        const updated = orders()[0];
        updated.items[0] = item("11", "First Aid – Blue", GIVEN);
        return json(updated);
      },
      "POST /api/stores/badges/orders/1/items/11/undo-given": () => json(orders()[0]),
    });
    await renderPage();
    await expand("Alex Smith");
    await act(async () => tick("Alex Smith", "First Aid – Blue").click());
    await waitFor(() => expect(toast).toHaveBeenCalled());
    const { action } = toast.mock.calls.at(-1)![1] as { action: { label: string; onClick: () => void } };
    expect(action.label).toBe("Undo");
    await act(async () => action.onClick());
    await waitFor(() => expect(calls(fetch, "POST /api/stores/badges/orders/1/items/11/undo-given")).toBe(1));
    await waitFor(() =>
      expect(tick("Alex Smith", "First Aid – Blue")).toHaveAttribute("aria-checked", "false")
    );
  });

  it("a refused hand-over says why and leaves the badge unticked, with no Undo offered", async () => {
    stubApi({
      "POST /api/stores/badges/orders/1/items/11/mark-given": () => json({ detail: "Already given" }, 409),
    });
    await renderPage();
    await expand("Alex Smith");
    await act(async () => tick("Alex Smith", "First Aid – Blue").click());
    expect(await screen.findByText("Already given")).toBeInTheDocument();
    expect(tick("Alex Smith", "First Aid – Blue")).toHaveAttribute("aria-checked", "false");
    expect(toast).not.toHaveBeenCalled();
  });
});

describe("unticking a given badge", () => {
  const undoneBella = () => {
    const updated = orders()[1];
    updated.items[0] = item("21", "First Aid – Bronze", {
      givenEvents: [
        { id: "a", action: "given", timestamp: "2026-10-01T18:00:00Z", by: "Sam Staff" },
        { id: "b", action: "undone", timestamp: "2026-10-02T09:00:00Z", by: "Sam Staff" },
      ],
    });
    return updated;
  };

  it("takes the badge back to waiting at once, and keeps both steps in its history", async () => {
    const fetch = stubApi({
      "POST /api/stores/badges/orders/2/items/21/undo-given": () => json(undoneBella()),
    });
    await renderPage();
    await expand("Bella Jones");
    expect(tick("Bella Jones", "First Aid – Bronze")).toHaveAttribute("aria-checked", "true");

    await act(async () => tick("Bella Jones", "First Aid – Bronze").click());

    await waitFor(() =>
      expect(tick("Bella Jones", "First Aid – Bronze")).toHaveAttribute("aria-checked", "false")
    );
    const [, init] = fetch.mock.calls.find(([u]) => String(u).endsWith("/undo-given"))!;
    expect(JSON.parse(String(init?.body))).toEqual({ by: "Sam Staff" });
    await userEvent.click(within(card("Bella Jones")).getByRole("button", { name: "History" }));
    const history = await screen.findByRole("list", { name: "Given history" });
    expect(
      within(history)
        .getAllByRole("listitem")
        .map((li) => li.textContent?.split(" ")[0])
    ).toEqual(["Given", "Undone"]);
    expect(toast).toHaveBeenCalledWith("First Aid – Bronze back to waiting");
  });

  it("shows the API's reason and leaves the badge given when the undo is refused", async () => {
    stubApi({
      "POST /api/stores/badges/orders/2/items/21/undo-given": () =>
        json({ detail: "Reopen the order before undoing a badge" }, 409),
    });
    await renderPage();
    await expand("Bella Jones");
    await act(async () => tick("Bella Jones", "First Aid – Bronze").click());

    expect(await screen.findByText("Reopen the order before undoing a badge")).toBeInTheDocument();
    expect(tick("Bella Jones", "First Aid – Bronze")).toHaveAttribute("aria-checked", "true");
  });

  // A closed order is a record of what was handed over; reopen it to change it.
  it("can't untick, or change anything, on a completed order", async () => {
    stubApi({
      "GET /api/stores/badges/orders": () => json([{ ...orders()[1], completed: true }]),
    });
    await act(async () => {
      renderWithQuery(
        <TooltipProvider>
          <BadgeOrdersPage />
        </TooltipProvider>
      );
    });
    // Radix tabs switch on mouse-down, which a bare .click() doesn't send.
    await userEvent.click(screen.getByRole("tab", { name: /Completed/ }));
    await screen.findByText("Bella Jones");
    await expand("Bella Jones");
    expect(screen.getByText(/Given .* · Sam Staff/)).toBeInTheDocument();
    expect(tick("Bella Jones", "First Aid – Bronze")).toBeDisabled();
    expect(within(card("Bella Jones")).queryByRole("button", { name: /More for/ })).toBeNull();
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
      renderWithQuery(
        <TooltipProvider>
          <BadgeOrdersPage />
        </TooltipProvider>
      );
    });
    expect(await screen.findByText("down")).toBeInTheDocument();
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

describe("the order list", () => {
  const ENTRY = {
    id: "e1",
    orderItemId: "12",
    badgeName: "Leadership – Bronze",
    cadetName: "Alex Smith",
    addedAt: "2026-09-03T10:00:00Z",
    addedBy: "Sam Staff",
    orderedAt: null,
    orderedBy: null,
    receivedAt: null,
    receivedBy: null,
  };

  const SECOND = { ...ENTRY, id: "e2", orderItemId: "11", badgeName: "First Aid – Blue" };

  it("marks every ticked badge ordered in one request and shows them under Ordered", async () => {
    const fetch = stubApi({
      "GET /api/stores/badges/order-lists": () => json([ENTRY, SECOND]),
      "POST /api/stores/badges/order-lists/mark-ordered": () =>
        json(
          [ENTRY, SECOND].map((e) => ({ ...e, orderedAt: "2026-11-15T19:00:00Z", orderedBy: "Sam Staff" }))
        ),
    });
    await renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /Order List/ }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select all" }));
    await userEvent.click(screen.getByRole("button", { name: "Mark 2 as ordered" }));

    const post = fetch.mock.calls.find(([url]) => String(url).endsWith("/order-lists/mark-ordered"))!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({ entryIds: ["e1", "e2"], by: "Sam Staff" });
    // Straight from the answer, no refetch of the list.
    expect(await screen.findByText(/No badges queued/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Mark as Received" })).toHaveLength(2);
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/order-lists")).length).toBe(1);
  });

  it("shows the API's reason when a bulk mark is refused, and moves nothing", async () => {
    stubApi({
      "GET /api/stores/badges/order-lists": () => json([ENTRY, SECOND]),
      "POST /api/stores/badges/order-lists/mark-ordered": () =>
        json({ detail: "Already marked ordered: First Aid – Blue (Alex Smith)" }, 409),
    });
    await renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /Order List/ }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select all" }));
    await userEvent.click(screen.getByRole("button", { name: "Mark 2 as ordered" }));

    expect(
      await screen.findByText("Already marked ordered: First Aid – Blue (Alex Smith)")
    ).toBeInTheDocument();
    expect(screen.getByText("Nothing on order.")).toBeInTheDocument();
  });

  // It used to count the orders on the tab, so always read "0 orders" here.
  it("the header says how many badges are to order and on order while that tab is open", async () => {
    stubApi({ "GET /api/stores/badges/order-lists": () => json([ENTRY, SECOND]) });
    await renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /Order List/ }));
    expect(await screen.findByText("2 to order · 0 on order")).toBeInTheDocument();
  });

  it("an entry links back to the badge on its order, opening it", async () => {
    stubApi({ "GET /api/stores/badges/order-lists": () => json([ENTRY]) });
    await renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /Order List/ }));
    await userEvent.click(await screen.findByTitle("Go to Alex Smith's order"));

    expect(screen.getByRole("tab", { name: /Active/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Collapse order for Alex Smith" })).toBeInTheDocument();
  });

  it("a note added on the list is saved on the badge's order", async () => {
    const fetch = stubApi({
      "GET /api/stores/badges/order-lists": () => json([ENTRY]),
      "PATCH /api/stores/badges/orders/1": (_url, init) =>
        json({ ...orders()[0], ...JSON.parse(String(init!.body)) }),
    });
    await renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /Order List/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Add note" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "QM note on Leadership – Bronze" }),
      "Wing out of stock"
    );
    await userEvent.click(screen.getByRole("button", { name: "Save Note" }));

    expect(await screen.findByText("Wing out of stock")).toBeInTheDocument();
    const [, init] = fetch.mock.calls.find(([, i]) => i?.method === "PATCH")!;
    const badge = JSON.parse(String(init!.body)).items.find((i: BadgeOrderItem) => i.id === "12");
    expect(badge.qmNotes).toEqual([expect.objectContaining({ content: "Wing out of stock" })]);
  });
});

describe("order list steps on the badge", () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    id: "e1",
    orderItemId: "11",
    badgeName: "First Aid – Blue",
    cadetName: "Alex Smith",
    addedAt: "2026-11-06T14:00:00Z",
    addedBy: "Sam Staff",
    orderedAt: null,
    orderedBy: null,
    receivedAt: null,
    receivedBy: null,
    history: [],
    ...over,
  });
  const ORDERED = { orderedAt: "2026-11-06T14:05:00Z", orderedBy: "Sam Staff" };
  const RECEIVED = { receivedAt: "2026-11-06T14:10:00Z", receivedBy: "Sam Staff" };

  it("a badge not in stock offers the order list as its next step", async () => {
    const fetch = stubApi({
      "POST /api/stores/badges/order-lists/entries": () => json(entry()),
    });
    await renderPage();
    await expand("Alex Smith");
    expect(within(card("Alex Smith")).getAllByText("To order").length).toBeGreaterThan(0);
    await act(async () =>
      within(card("Alex Smith")).getAllByRole("button", { name: "Add to order list" })[0].click()
    );
    await waitFor(() => expect(calls(fetch, "POST /api/stores/badges/order-lists/entries")).toBe(1));
  });

  it("each stage says where the badge is and offers the step after it", async () => {
    stubApi({ "GET /api/stores/badges/order-lists": () => json([entry()]) });
    await renderPage();
    await expand("Alex Smith");
    expect(within(card("Alex Smith")).getByText("On the order list")).toBeInTheDocument();
    expect(within(card("Alex Smith")).getByRole("button", { name: "Mark as ordered" })).toBeInTheDocument();
  });

  it("an ordered badge offers Mark as received, and keeps its undos in the menu", async () => {
    stubApi({ "GET /api/stores/badges/order-lists": () => json([entry(ORDERED)]) });
    await renderPage();
    await expand("Alex Smith");
    expect(within(card("Alex Smith")).getByText("On order")).toBeInTheDocument();
    expect(within(card("Alex Smith")).getByRole("button", { name: "Mark as received" })).toBeInTheDocument();
    await openMenu("Alex Smith", "First Aid – Blue");
    const items = screen.getAllByRole("menuitem").map((m) => m.textContent);
    expect(items).toEqual([
      "Remove from stockNone in stock",
      "Undo ordered",
      "Take off order list",
      "Ready to collect",
      "Delete item",
    ]);
  });

  it("undoing the latest step goes straight through, with no confirm", async () => {
    const fetch = stubApi({
      "GET /api/stores/badges/order-lists": () => json([entry(ORDERED)]),
      "POST /api/stores/badges/order-lists/entries/e1/undo-ordered": () => json(entry()),
    });
    await renderPage();
    await expand("Alex Smith");
    await openMenu("Alex Smith", "First Aid – Blue");
    await pick("Undo ordered");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(calls(fetch, "POST /api/stores/badges/order-lists/entries/e1/undo-ordered")).toBe(1)
    );
  });

  // Undoing "ordered" on a received badge takes "received" with it, so say so.
  it("undoing a step that has later steps asks first", async () => {
    const fetch = stubApi({
      "GET /api/stores/badges/order-lists": () => json([entry({ ...ORDERED, ...RECEIVED })]),
      "POST /api/stores/badges/order-lists/entries/e1/undo-ordered": () => json(entry()),
    });
    await renderPage();
    await expand("Alex Smith");
    await openMenu("Alex Smith", "First Aid – Blue");
    await pick("Undo ordered");
    expect(
      within(screen.getByRole("dialog")).getByText(/received, so that is undone too/)
    ).toBeInTheDocument();
    expect(calls(fetch, "POST /api/stores/badges/order-lists/entries/e1/undo-ordered")).toBe(0);
    await confirmDialog();
    await waitFor(() =>
      expect(calls(fetch, "POST /api/stores/badges/order-lists/entries/e1/undo-ordered")).toBe(1)
    );
  });

  it("undoing received calls its own undo", async () => {
    const fetch = stubApi({
      "GET /api/stores/badges/order-lists": () => json([entry({ ...ORDERED, ...RECEIVED })]),
      "POST /api/stores/badges/order-lists/entries/e1/undo-received": () => json(entry(ORDERED)),
    });
    await renderPage();
    await expand("Alex Smith");
    expect(within(card("Alex Smith")).getByText("Arrived")).toBeInTheDocument();
    await openMenu("Alex Smith", "First Aid – Blue");
    await pick("Undo received");
    await waitFor(() =>
      expect(calls(fetch, "POST /api/stores/badges/order-lists/entries/e1/undo-received")).toBe(1)
    );
  });

  it("taking an ordered badge off the list asks first, then removes it", async () => {
    const fetch = stubApi({
      "GET /api/stores/badges/order-lists": () => json([entry(ORDERED)]),
      "DELETE /api/stores/badges/order-lists/entries/e1": () => new Response(null, { status: 204 }),
    });
    await renderPage();
    await expand("Alex Smith");
    await openMenu("Alex Smith", "First Aid – Blue");
    await pick("Take off order list");
    expect(within(screen.getByRole("dialog")).getByText(/ordered step is undone too/)).toBeInTheDocument();
    await confirmDialog();
    await waitFor(() => expect(calls(fetch, "DELETE /api/stores/badges/order-lists/entries/e1")).toBe(1));
  });

  it("a refused undo shows an error and leaves the step done", async () => {
    stubApi({
      "GET /api/stores/badges/order-lists": () => json([entry(ORDERED)]),
      "POST /api/stores/badges/order-lists/entries/e1/undo-ordered": () => json({ detail: "nope" }, 409),
    });
    await renderPage();
    await expand("Alex Smith");
    await openMenu("Alex Smith", "First Aid – Blue");
    await pick("Undo ordered");
    expect(await screen.findByText("Failed to undo ordered")).toBeInTheDocument();
    expect(within(card("Alex Smith")).getByText("On order")).toBeInTheDocument();
  });

  it("once a step has been undone, the badge's history shows every step and undo", async () => {
    stubApi({
      "GET /api/stores/badges/order-lists": () =>
        json([
          entry({
            history: [
              { id: "a", action: "added", timestamp: "2026-11-06T14:00:00Z", by: "Sam Staff" },
              { id: "b", action: "ordered", timestamp: "2026-11-06T14:05:00Z", by: "Sam Staff" },
              { id: "c", action: "ordered_undone", timestamp: "2026-11-06T14:06:00Z", by: "QM Jones" },
            ],
          }),
        ]),
    });
    await renderPage();
    await expand("Alex Smith");
    await userEvent.click(within(card("Alex Smith")).getByRole("button", { name: "History" }));
    const history = within(card("Alex Smith")).getByRole("list", { name: "Order list history" });
    expect(history).toHaveTextContent("Ordered undone");
    expect(history).toHaveTextContent("QM Jones");
  });

  // These used to vanish: the steps are reachable until they're done.
  it("a badge taken from stock and on order can still be marked received", async () => {
    const list = orders();
    list[0].items[0] = item("11", "First Aid – Blue", {
      stockEvents: [{ id: "s1", action: "removed", timestamp: "2026-11-06T14:00:00Z", by: "Sam Staff" }],
    } as Partial<BadgeOrderItem>);
    stubApi({
      "GET /api/stores/badges/orders": () => json(list),
      "GET /api/stores/badges/order-lists": () => json([entry(ORDERED)]),
    });
    await renderPage();
    await expand("Alex Smith");
    await openMenu("Alex Smith", "First Aid – Blue");
    expect(screen.getByRole("menuitem", { name: "Mark as received" })).toBeInTheDocument();
  });

  it("a badge not yet on the list can go straight to ordered or received", async () => {
    stubApi();
    await renderPage();
    await expand("Alex Smith");
    await openMenu("Alex Smith", "First Aid – Blue");
    expect(screen.getByRole("menuitem", { name: "Send to ordered" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Mark as received" })).toBeInTheDocument();
  });

  // Giving doesn't wait for the supplier: a badge in stock goes out unordered.
  it("a badge can be ticked off without ever being on the order list", async () => {
    stubApi();
    await renderPage();
    await expand("Alex Smith");
    expect(tick("Alex Smith", "First Aid – Blue")).toBeEnabled();
  });
});
