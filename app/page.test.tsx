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

const current = {
  total_cadets: 20,
  by_flight: { A: 12, B: 8 },
  by_age: {},
  by_rank: { Cadet: 17, Cpl: 3 },
  by_classification: {},
  badges: { first_aid: { None: 15, Blue: 5 } },
};
const award = {
  cin: 1,
  name: "Zoë Ó Briain",
  flight: "A",
  junior: false,
  badge: "first_aid",
  level: "Blue",
  date: "2026-10-01",
};

function stubApi(routes: Record<string, [unknown, number?]>) {
  const fetch = vi.fn((url: string) => {
    const hit = Object.entries(routes).find(([path]) => String(url).includes(path));
    const [body, status] = hit?.[1] ?? [{ detail: "not stubbed" }, 404];
    return Promise.resolve(new Response(JSON.stringify(body), { status: status ?? 200 }));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 7, 20, 0) });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("dashboard", () => {
  it("links to the stats page from the header and the badge summary", async () => {
    stubApi({ "/stats/current": [current], "/stats/awards": [[]] });
    await renderDashboard();
    expect(screen.getByRole("link", { name: "Squadron stats" }).getAttribute("href")).toBe("/stats");
    expect(screen.getByRole("link", { name: "Trends and filters" }).getAttribute("href")).toBe("/stats");
  });

  it("summarises badges without fetching the history the stats page charts", async () => {
    const fetch = stubApi({ "/stats/current": [current], "/stats/awards": [[]] });
    await renderDashboard();
    expect(
      screen.getByRole("listitem", { name: /First Aid: 5 of 20 cadets hold it \(5 Blue\)/ })
    ).toBeTruthy();
    expect(fetch.mock.calls.some(([url]) => String(url).includes("/stats/history"))).toBe(false);
  });

  it("shows the last month's awards", async () => {
    const fetch = stubApi({ "/stats/current": [current], "/stats/awards": [[award]] });
    await renderDashboard();
    expect(screen.getByText("Zoë Ó Briain")).toBeTruthy();
    expect(screen.getByText("Blue First Aid")).toBeTruthy();
    expect(fetch.mock.calls.some(([url]) => String(url).includes("/stats/awards?days=30"))).toBe(true);
  });

  it("says so when nobody gained a badge this month", async () => {
    stubApi({ "/stats/current": [current], "/stats/awards": [[]] });
    await renderDashboard();
    expect(screen.getByText("No badges gained this month.")).toBeTruthy();
  });

  it("an error body where the awards list was expected doesn't crash the page", async () => {
    stubApi({ "/stats/current": [current], "/stats/awards": [{ detail: "boom" }, 500] });
    await renderDashboard();
    expect(screen.getByText("Cadets on strength")).toBeTruthy();
    expect(screen.getByText("No badges gained this month.")).toBeTruthy();
  });

  it("hides staff tools from NCOs", async () => {
    stubApi({ "/stats/current": [current], "/stats/awards": [[]] });
    await renderDashboard();
    expect(screen.queryByText("Bader Scrapers")).toBeNull();
  });
});
