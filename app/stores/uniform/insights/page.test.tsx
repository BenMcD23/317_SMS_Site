// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import UniformInsightsPage from "@/app/stores/uniform/insights/page";
import { canAccess } from "@/lib/access";
import type { InsightLine, StoresInsights } from "@/lib/stores-insights";

// One stable object, like the real hook — pages key effects on `session`.
const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));

function line(over: Partial<InsightLine>): InsightLine {
  return {
    itemType: "Beret",
    size: "56",
    requested: 0,
    given: 0,
    waiting: 0,
    inStock: 0,
    monthlyRate: 0,
    toOrder: 0,
    status: "ok",
    lastRequested: null,
    ...over,
  };
}

const SHORT = line({
  size: "56",
  requested: 8,
  given: 6,
  waiting: 2,
  inStock: 1,
  toOrder: 3,
  status: "short",
});
const OK = line({ size: "57", requested: 2, given: 2, inStock: 4, status: "ok" });
const UNUSED = line({ size: "60", inStock: 7, status: "unused", lastRequested: "2024-03-02T10:00:00" });
const BELT = line({ itemType: "Belt", size: "", requested: 1, given: 1, toOrder: 1, status: "out" });

function insights(over: Partial<StoresInsights> = {}): StoresInsights {
  return {
    since: "2025-10-15T00:00:00",
    months: 12,
    coverMonths: 3,
    summary: {
      requested: 12,
      given: 9,
      waiting: 2,
      awaitingSizing: 1,
      inStock: 12,
      linesToOrder: 2,
      unitsToOrder: 4,
      unusedLines: 1,
      unusedUnits: 7,
    },
    items: [
      {
        itemType: "Beret",
        requested: 11,
        given: 8,
        waiting: 3,
        awaitingSizing: 1,
        inStock: 12,
        topSize: "56",
        sizes: [SHORT, OK, UNUSED],
      },
      {
        itemType: "Belt",
        requested: 1,
        given: 1,
        waiting: 0,
        awaitingSizing: 0,
        inStock: 0,
        topSize: "",
        sizes: [BELT],
      },
    ],
    toOrder: [SHORT, BELT],
    unused: [UNUSED],
    ...over,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function api(answer: () => Response = () => json(insights())) {
  const fetchMock = vi.fn(async (url: string) =>
    url.includes("/stores/insights") ? answer() : json({}, 404)
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Each cell's text. The status and counts show twice (under the item on a
 *  phone, in their own columns wider), and jsdom applies no CSS, so both are
 *  in the text. */
const cells = (row: HTMLElement) =>
  within(row)
    .getAllByRole("cell")
    .map((c) => c.textContent);

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UniformInsightsPage />
    </QueryClientProvider>
  );
}

describe("Uniform insights page", () => {
  it("leads with the order list, cadets already waiting first", async () => {
    api();
    renderPage();

    const rows = await screen.findAllByRole("row");
    // Header, then the API's order: the short beret before the belt.
    expect(cells(rows[1])).toEqual([
      "BeretCadets waiting1 on shelf · 2 waiting",
      "56",
      "Cadets waiting",
      "2",
      "1",
      "3",
    ]);
    expect(cells(rows[2])).toEqual(["BeltOut of stock0 on shelf", "One size", "Out of stock", "—", "0", "1"]);
    expect(screen.getByText("To order", { selector: "p" }).parentElement).toHaveTextContent(
      "To order42 item sizes"
    );
    expect(screen.getByText("1 still to be measured")).toBeInTheDocument();
  });

  it("shows every size's demand against the shelf, and the most common size", async () => {
    api();
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByRole("row");

    await user.click(screen.getByRole("tab", { name: "Popular sizes 2" }));
    const beret = screen.getByRole("region", { name: "Beret" });
    expect(within(beret).getByText(/11 asked for · most often 56/)).toBeInTheDocument();
    expect(within(beret).getByLabelText("56: 8 asked for, 1 on the shelf, Cadets waiting")).toHaveTextContent(
      "Order 3"
    );
    expect(within(beret).getByLabelText("60: 0 asked for, 7 on the shelf, Not given out")).toHaveTextContent(
      "Unused"
    );
    expect(
      within(screen.getByRole("region", { name: "Belt" })).getByText(/most often One size/)
    ).toBeInTheDocument();
  });

  it("a size asked for too seldom to keep says to order it when needed", async () => {
    const rare = line({ size: "62", requested: 1, given: 1, status: "rare" });
    api(() => json(insights({ items: [{ ...insights().items[0], sizes: [rare] }] })));
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByRole("row");

    await user.click(screen.getByRole("tab", { name: "Popular sizes 1" }));
    expect(screen.getByLabelText("62: 1 asked for, 0 on the shelf, Order when needed")).toHaveTextContent(
      "When needed"
    );
  });

  it("lists stock nobody asked for, with when it last went out", async () => {
    api(() =>
      json(
        insights({
          unused: [UNUSED, line({ itemType: "Jumper", size: "136", inStock: 2, status: "unused" })],
        })
      )
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByRole("row");

    await user.click(screen.getByRole("tab", { name: "Not given out 2" }));
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Beret607");
    expect(rows[1]).toHaveTextContent("2 Mar 2024");
    expect(rows[2]).toHaveTextContent("Jumper1362Never");
  });

  it("changing the window and cover asks the API again with them", async () => {
    const fetchMock = api();
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByRole("row");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/stores/insights?months=12&cover=3");

    const lookBack = screen.getByRole("radiogroup", { name: "Look back over" });
    const cover = screen.getByRole("radiogroup", { name: "Order enough for" });
    await user.click(within(lookBack).getByRole("radio", { name: "24 months" }));
    await user.click(within(cover).getByRole("radio", { name: "6 months" }));
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain("http://localhost:8000/stores/insights?months=24&cover=3");
    expect(urls.at(-1)).toContain("months=24&cover=6");
  });

  it("clicking the chosen window again keeps it rather than clearing it", async () => {
    const fetchMock = api();
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByRole("row");

    const twelve = within(screen.getByRole("radiogroup", { name: "Look back over" })).getByRole("radio", {
      name: "12 months",
    });
    await user.click(twelve);
    expect(twelve).toHaveAttribute("aria-checked", "true");
    expect(fetchMock.mock.calls.every((c) => String(c[0]).includes("months=12"))).toBe(true);
  });

  it("nothing to order and nothing unused say so instead of showing empty tables", async () => {
    api(() =>
      json(
        insights({
          toOrder: [],
          unused: [],
          summary: { ...insights().summary, unitsToOrder: 0, linesToOrder: 0 },
        })
      )
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Nothing to order")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Not given out 0" }));
    expect(screen.getByText("Everything on the shelf gets used")).toBeInTheDocument();
  });

  it("an empty stores shows an empty state on the sizes tab", async () => {
    api(() => json(insights({ items: [], toOrder: [], unused: [] })));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Nothing to order");

    await user.click(screen.getByRole("tab", { name: "Popular sizes 0" }));
    expect(screen.getByText("No uniform orders yet")).toBeInTheDocument();
  });

  it("says which items the order list leaves out", async () => {
    api(() => json(insights({ notOnOrderList: ["Beret", "Belt", "Brassard", "Tie"] })));
    renderPage();

    expect(
      await screen.findByText(/Not listed, as they're topped up as needed: Beret, Belt, Brassard and Tie\./)
    ).toBeInTheDocument();
  });

  it("an API without the left-out list says nothing about it", async () => {
    api();
    renderPage();
    await screen.findAllByRole("row");

    expect(screen.queryByText(/Not listed/)).toBeNull();
  });

  it("a 500 shows the API's error instead of crashing", async () => {
    api(() => json({ detail: "Database unavailable" }, 500));
    renderPage();

    expect(await screen.findByText("Database unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("the API being unreachable is an error, not an endless skeleton", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch")))
    );
    renderPage();

    expect(await screen.findByText("Couldn't load the insights")).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading insights")).toBeNull();
  });

  it.each([
    ["staff", true],
    ["snco", false],
    ["nco", false],
    [undefined, false],
  ])("role %s may open it: %s", (role, allowed) => {
    expect(canAccess(role, "/stores/uniform/insights")).toBe(allowed);
  });
});
