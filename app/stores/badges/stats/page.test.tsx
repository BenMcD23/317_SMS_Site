// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StatsPage from "@/app/stores/badges/stats/page";
import type { BadgeOrderStats } from "@/lib/order-stats";

const SESSION = { data: { id_token: "tok", role: "staff" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION }));
vi.mock("@/lib/reference", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reference")>()),
  useReference: () => ({ gainedWhereOptions: [{ value: "camp", label: "At camp" }] }),
}));
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

const STATS: BadgeOrderStats = {
  days: 365,
  total_orders: 2,
  completed_orders: 1,
  total_items: 4,
  replacements: 1,
  badges: [
    { badge_name: "Blue Badge", count: 2, orders: 2, replacements: 1, given: 1 },
    { badge_name: "Cyber Badge", count: 1, orders: 1, replacements: 0, given: 0 },
  ],
  gained_where: [
    { label: "camp", count: 2 },
    { label: "mystery", count: 1 },
  ],
  monthly: [{ month: "2026-09", orders: 2 }],
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

describe("badge order stats page", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(json(STATS)));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ranks badges and labels where they were gained", async () => {
    renderPage();
    expect(await screen.findByText("Blue Badge")).toBeTruthy();
    expect(screen.getByText("1 replacement")).toBeTruthy();
    expect(screen.getByText("At camp")).toBeTruthy();
    // A value the reference doesn't know is shown raw, not dropped.
    expect(screen.getByText("mystery")).toBeTruthy();
  });

  it("shows an empty state when there are no orders", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(json({ ...STATS, total_orders: 0, total_items: 0, badges: [], gained_where: [], monthly: [] }))
    );
    renderPage();
    expect(await screen.findByText("No badge orders in this range")).toBeTruthy();
  });

  it("shows the error instead of crashing when the API answers with an error body", async () => {
    vi.stubGlobal("fetch", vi.fn(json({ detail: "Staff only" }, 403)));
    renderPage();
    expect(await screen.findByText("Staff only")).toBeTruthy();
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
