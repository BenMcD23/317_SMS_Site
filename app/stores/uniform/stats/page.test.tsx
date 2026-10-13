// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StatsPage from "@/app/stores/uniform/stats/page";
import type { UniformOrderStats } from "@/lib/order-stats";

const SESSION = { data: { id_token: "tok", role: "staff" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION }));
// Recharts needs a measured box that jsdom doesn't have.
vi.mock("recharts", async () => {
  const React = await import("react");
  const Stub = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  return {
    Bar: Stub,
    BarChart: Stub,
    CartesianGrid: Stub,
    ResponsiveContainer: Stub,
    Tooltip: Stub,
    XAxis: Stub,
    YAxis: Stub,
  };
});

const STATS: UniformOrderStats = {
  days: 365,
  total_orders: 4,
  completed_orders: 2,
  kitting_orders: 1,
  total_items: 6,
  items: [
    {
      item_type: "Beret",
      count: 3,
      orders: 3,
      given: 1,
      top_size: "58",
      sizes: [
        { label: "58", count: 2 },
        { label: "56", count: 1 },
      ],
    },
    {
      item_type: "Tie",
      count: 1,
      orders: 1,
      given: 0,
      top_size: null,
      sizes: [{ label: "Not sized yet", count: 1 }],
    },
  ],
  monthly: [{ month: "2026-09", orders: 4 }],
};

function json(body: unknown, status = 200) {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StatsPage />
    </QueryClientProvider>
  );
}

describe("uniform order stats page", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(json(STATS)));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ranks the items and shows the common size of each", async () => {
    renderPage();
    expect(await screen.findByText("Most common size: 58")).toBeTruthy();
    expect(screen.getByText("Most ordered items")).toBeTruthy();
    expect(screen.getByText("Sizes by item")).toBeTruthy();
    expect(screen.getByText("Not sized yet")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy(); // 2 of 4 orders completed
  });

  it("asks the API for the chosen window", async () => {
    renderPage();
    await screen.findByText("Most ordered items");
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("/stores/orders/stats?days=365");
    fireEvent.click(screen.getByRole("radio", { name: "All time" }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.at(-1)![0]).toMatch(/\/stores\/orders\/stats$/));
  });

  it("shows an empty state when there are no orders", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(json({ ...STATS, total_orders: 0, total_items: 0, items: [], monthly: [] }))
    );
    renderPage();
    expect(await screen.findByText("No orders in this range")).toBeTruthy();
  });

  it("shows the error instead of crashing when the API answers with an error body", async () => {
    vi.stubGlobal("fetch", vi.fn(json({ detail: "Staff only" }, 403)));
    renderPage();
    expect(await screen.findByText("Staff only")).toBeTruthy();
    expect(screen.queryByText("Most ordered items")).toBeNull();
  });

  it("survives a server error with no body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 500 })))
    );
    renderPage();
    expect(await screen.findByText("Couldn't load order stats")).toBeTruthy();
  });
});
