// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";

const SESSION = {
  data: { id_token: "tok", role: "nco", user: { email: "nco@317atc.co.uk", name: "Nat NCO" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({
  useSession: () => SESSION,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const breakdown = (n: number) => ({ total_cadets: n, badges: { first_aid: { None: 1, Heartstart: n - 1 } } });
const current = {
  total_cadets: 20,
  by_flight: {},
  by_age: {},
  by_rank: {},
  by_classification: {},
  badges: breakdown(20).badges,
  non_junior: breakdown(9),
};

function stubApi(history: unknown, stats: unknown = current, statsStatus = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(
        String(url).includes("/stats/history")
          ? new Response(JSON.stringify(history), { status: 200 })
          : new Response(JSON.stringify(stats), { status: statsStatus })
      )
    )
  );
}

async function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <HomePage />
      </QueryClientProvider>
    );
  });
  for (let i = 0; i < 5; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
}

async function excludeJuniors() {
  await act(async () => screen.getByRole("checkbox", { name: "Exclude junior cadets" }).click());
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 2, 20, 0) });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("dashboard badge trend", () => {
  // The bug: the scraper's first snapshot with a non-junior breakdown was the
  // only filtered point, and one point wasn't enough to draw anything.
  it("excluding juniors with only today's snapshot still charts instead of saying there isn't enough history", async () => {
    stubApi([
      { date: "2026-09-01T19:00:00", data: { ...current, non_junior: undefined } },
      { date: "2026-10-02T19:00:00", data: current },
    ]);
    await renderDashboard();
    await excludeJuniors();
    expect(screen.queryByText("Not enough history to chart a trend yet")).toBeNull();
    // Card counts come from the non-junior cohort.
    expect(screen.getByText("8/9")).toBeTruthy();
  });

  it("excluding juniors with no filtered snapshots at all still charts today's live numbers", async () => {
    stubApi([{ date: "2026-09-01T19:00:00", data: { ...current, non_junior: undefined } }]);
    await renderDashboard();
    await excludeJuniors();
    expect(screen.queryByText("Not enough history to chart a trend yet")).toBeNull();
  });

  it("an empty history still charts today's live numbers", async () => {
    stubApi([]);
    await renderDashboard();
    expect(screen.queryByText("Not enough history to chart a trend yet")).toBeNull();
  });

  it("an error body where the history list was expected doesn't crash the page", async () => {
    stubApi({ detail: "boom" });
    await renderDashboard();
    expect(screen.getByRole("checkbox", { name: "Exclude junior cadets" })).toBeTruthy();
  });

  it("stats from before the non-junior breakdown existed show the empty-trend message when filtered", async () => {
    stubApi([], { ...current, non_junior: undefined });
    await renderDashboard();
    await excludeJuniors();
    expect(screen.getAllByText("Not enough history to chart a trend yet").length).toBeGreaterThan(0);
  });
});
