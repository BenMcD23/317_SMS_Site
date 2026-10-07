// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StatsPage from "@/app/stats/page";

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

// The URL is the filter state: tests set it before rendering, and the page
// writes it back with history.replaceState (which Next syncs to useSearchParams).
// The mock reads the URL as of the last render, like the real hook.
vi.mock("next/navigation", () => ({
  usePathname: () => "/stats",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
const lastUrl = () => {
  const calls = vi.mocked(window.history.replaceState).mock.calls;
  return calls.length ? String(calls[calls.length - 1][2]) : null;
};

const breakdown = (n: number) => ({ total_cadets: n, badges: { first_aid: { None: 1, Heartstart: n - 1 } } });
const current = {
  total_cadets: 20,
  by_flight: { A: 12, B: 8 },
  by_age: { "14": 20 },
  by_rank: { Cadet: 20 },
  by_classification: { "Junior Cadet": 11, "Leading Cadet": 9 },
  badges: breakdown(20).badges,
  non_junior: breakdown(9),
  flights: {
    A: { ...breakdown(12), non_junior: breakdown(5) },
    B: { ...breakdown(8), non_junior: breakdown(4) },
  },
};
const awards = [
  {
    cin: 1,
    name: "Ann Alpha",
    flight: "A",
    junior: false,
    badge: "first_aid",
    level: "Blue",
    date: "2026-10-01",
  },
  {
    cin: 2,
    name: "Ben Bravo",
    flight: "B",
    junior: true,
    badge: "leadership",
    level: "Bronze",
    date: "2026-09-20",
  },
];
const expiring = [
  {
    cin: 3,
    name: "Cat Alpha",
    flight: "A",
    junior: false,
    qual_type: "St John Youth First Aid",
    date_expires: "2026-10-20",
    days_left: 13,
  },
];

type Routes = Record<string, [unknown, number?]>;
const OK: Routes = {
  "/stats/current": [current],
  "/stats/history": [[]],
  "/stats/awards": [awards],
  "/stats/expiring": [expiring],
};

function stubApi(over: Routes = {}) {
  const routes = { ...OK, ...over };
  const fetch = vi.fn((url: string) => {
    const hit = Object.entries(routes).find(([path]) => String(url).includes(path));
    const [body, status] = hit?.[1] ?? [{ detail: "not stubbed" }, 404];
    return Promise.resolve(new Response(JSON.stringify(body), { status: status ?? 200 }));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function renderStats(query = "") {
  window.history.replaceState(null, "", query ? `/stats?${query}` : "/stats");
  vi.spyOn(window.history, "replaceState");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <StatsPage />
      </QueryClientProvider>
    );
  });
  for (let i = 0; i < 5; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
}

const requested = (fetch: ReturnType<typeof stubApi>, path: string) =>
  fetch.mock.calls.some(([url]) => String(url).includes(path));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 2, 20, 0) });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("time range", () => {
  it("defaults to six months and asks the API for that window", async () => {
    const fetch = stubApi();
    await renderStats();
    expect(requested(fetch, "/stats/history?days=182")).toBe(true);
    expect(requested(fetch, "/stats/awards?days=182")).toBe(true);
    expect(screen.getByRole("radio", { name: "Last 6 months" }).getAttribute("data-state")).toBe("on");
  });

  it("asks for all history with no window", async () => {
    const fetch = stubApi();
    await renderStats("range=all");
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith("/stats/history"))).toBe(true);
  });

  it("an unknown range in the URL falls back to the default rather than breaking", async () => {
    const fetch = stubApi();
    await renderStats("range=forever");
    expect(requested(fetch, "/stats/history?days=182")).toBe(true);
  });

  it("choosing a range puts it in the URL", async () => {
    stubApi();
    await renderStats();
    await act(async () => screen.getByRole("radio", { name: "Last year" }).click());
    expect(lastUrl()).toBe("/stats?range=1y");
  });

  it("choosing the default range clears it from the URL, keeping other filters", async () => {
    stubApi();
    await renderStats("range=1y&juniors=0");
    await act(async () => screen.getByRole("radio", { name: "Last 6 months" }).click());
    expect(lastUrl()).toBe("/stats?juniors=0");
  });
});

describe("2 week and 1 month ranges", () => {
  it.each([
    ["Last 2 weeks", "range=2w", "days=14"],
    ["Last month", "range=1m", "days=30"],
  ])("%s toggles into the URL and asks the API for %s", async (name, url, query) => {
    const fetch = stubApi();
    await renderStats();
    await act(async () => screen.getByRole("radio", { name }).click());
    expect(lastUrl()).toBe(`/stats?${url}`);

    await renderStats(url);
    expect(requested(fetch, `/stats/history?${query}`)).toBe(true);
    expect(requested(fetch, `/stats/awards?${query}`)).toBe(true);
  });
});

describe("time range picker", () => {
  async function openPicker() {
    await act(async () => screen.getByRole("button", { name: /^Time range:/ }).click());
  }
  const typeDate = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it("names the current range on its button", async () => {
    stubApi();
    await renderStats("range=1m");
    expect(screen.getByRole("button", { name: "Time range: Last month" })).toBeTruthy();
  });

  it("applies a from/to range, replacing the preset in the URL", async () => {
    stubApi();
    await renderStats("range=1y&juniors=0");
    await openPicker();
    typeDate("From", "2026-03-01");
    typeDate("To", "2026-04-15");
    await act(async () => screen.getByRole("button", { name: "Apply time range" }).click());
    expect(lastUrl()).toBe("/stats?juniors=0&from=2026-03-01&to=2026-04-15");
  });

  it("won't apply a range that ends before it starts, and says why", async () => {
    stubApi();
    await renderStats();
    await openPicker();
    typeDate("From", "2026-05-01");
    typeDate("To", "2026-04-01");
    expect(screen.getByRole("alert").textContent).toBe("From must be on or before To");
    expect(screen.getByRole("button", { name: "Apply time range" }).hasAttribute("disabled")).toBe(true);
  });

  it("won't apply with a date missing", async () => {
    stubApi();
    await renderStats();
    await openPicker();
    // To starts as today; From is empty until picked.
    expect(screen.getByRole("button", { name: "Apply time range" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("opens on the custom range being shown, so one end can be nudged", async () => {
    stubApi();
    await renderStats("from=2026-03-01&to=2026-04-15");
    await openPicker();
    expect((screen.getByLabelText("From") as HTMLInputElement).value).toBe("2026-03-01");
    expect((screen.getByLabelText("To") as HTMLInputElement).value).toBe("2026-04-15");
  });

  it("a quick range from the picker clears a custom one", async () => {
    stubApi();
    await renderStats("from=2026-03-01&to=2026-04-15&flight=A");
    await openPicker();
    await act(async () =>
      within(screen.getByRole("dialog")).getByRole("button", { name: "Last 2 weeks" }).click()
    );
    expect(lastUrl()).toBe("/stats?flight=A&range=2w");
  });

  it("a custom range asks the API for those dates, and no preset toggle is pressed", async () => {
    const fetch = stubApi();
    await renderStats("from=2026-03-01&to=2026-04-15");
    expect(requested(fetch, "/stats/history?start=2026-03-01&end=2026-04-15")).toBe(true);
    expect(requested(fetch, "/stats/awards?start=2026-03-01&end=2026-04-15")).toBe(true);
    for (const radio of screen.getAllByRole("radio")) expect(radio.getAttribute("data-state")).toBe("off");
    expect(screen.getByRole("button", { name: "Time range: 1 Mar 2026 – 15 Apr 2026" })).toBeTruthy();
  });

  it("a past range shows its last snapshot, not today's numbers", async () => {
    stubApi({
      "/stats/history": [
        [
          {
            date: "2026-03-05T19:00:00",
            data: { ...current, badges: breakdown(10).badges, total_cadets: 10 },
          },
          {
            date: "2026-04-10T19:00:00",
            data: { ...current, badges: breakdown(14).badges, total_cadets: 14 },
          },
        ],
      ],
    });
    await renderStats("from=2026-03-01&to=2026-04-15");
    // Live is 19/20; the range ended at 13/14.
    expect(screen.getByText("13/14")).toBeTruthy();
    expect(screen.queryByText("19/20")).toBeNull();
    expect(screen.getByText("+4 between 1 Mar 2026 and 15 Apr 2026")).toBeTruthy();
  });

  it("a range reaching today still ends on the live numbers", async () => {
    stubApi({ "/stats/history": [[{ date: "2026-09-05T19:00:00", data: current }]] });
    await renderStats("from=2026-09-01&to=2026-10-02");
    expect(screen.getByText("19/20")).toBeTruthy();
  });

  it("a past range with no snapshots says so instead of showing blank charts", async () => {
    stubApi();
    await renderStats("from=2025-01-01&to=2025-02-01");
    expect(screen.getByRole("status").textContent).toContain(
      "No snapshots were taken between 1 Jan 2025 and 1 Feb 2025"
    );
  });

  it("a half-written custom range in the URL falls back to the preset", async () => {
    const fetch = stubApi();
    await renderStats("range=1m&from=2026-03-01");
    expect(requested(fetch, "/stats/history?days=30")).toBe(true);
  });
});

describe("filters", () => {
  it("excluding juniors puts it in the URL", async () => {
    stubApi();
    await renderStats();
    await act(async () => screen.getByRole("checkbox", { name: "Exclude junior cadets" }).click());
    expect(lastUrl()).toBe("/stats?juniors=0");
  });

  // The bug: each change rebuilt the URL from the params of the last render, so
  // a second change before the page re-rendered dropped the first.
  it("two quick filter changes both stick", async () => {
    stubApi();
    await renderStats();
    screen.getByRole("checkbox", { name: "Exclude junior cadets" }).click();
    screen.getByRole("radio", { name: "Last year" }).click();
    expect(lastUrl()).toBe("/stats?juniors=0&range=1y");
  });

  it("excluding juniors counts badges over the non-junior cohort and drops juniors from the lists", async () => {
    stubApi();
    await renderStats("juniors=0");
    expect(screen.getByText("8/9")).toBeTruthy();
    expect(screen.getByText("Ann Alpha")).toBeTruthy();
    expect(screen.queryByText("Ben Bravo")).toBeNull();
  });

  it("a flight narrows the badges and both lists to that flight", async () => {
    stubApi();
    await renderStats("flight=B");
    expect(screen.getByText("7/8")).toBeTruthy();
    expect(screen.getByText("Ben Bravo")).toBeTruthy();
    expect(screen.queryByText("Ann Alpha")).toBeNull();
    expect(screen.getByText("Nothing lapses in the next three months.")).toBeTruthy();
  });

  it("a flight and excluding juniors combine", async () => {
    stubApi();
    await renderStats("flight=A&juniors=0");
    expect(screen.getByText("4/5")).toBeTruthy();
  });

  it("a flight that no longer exists falls back to the whole squadron", async () => {
    stubApi();
    await renderStats("flight=Z");
    expect(screen.getByText("19/20")).toBeTruthy();
    expect(screen.getByText("Ann Alpha")).toBeTruthy();
  });

  it("stats from before the per-flight breakdown still offer the flights on strength", async () => {
    stubApi({ "/stats/current": [{ ...current, flights: undefined }] });
    await renderStats("flight=A");
    expect(screen.getByRole("combobox", { name: "Flight" }).textContent).toContain("A Flight");
    // No breakdown for the flight: the cards show an empty cohort, not the squadron's numbers.
    expect(screen.getAllByText("0/0").length).toBeGreaterThan(0);
  });
});

describe("badge trend", () => {
  // The bug: the scraper's first snapshot with a non-junior breakdown was the
  // only filtered point, and one point wasn't enough to draw anything.
  it("excluding juniors with only one filtered snapshot still charts against today", async () => {
    stubApi({
      "/stats/history": [
        [
          { date: "2026-09-01T19:00:00", data: { ...current, non_junior: undefined } },
          { date: "2026-09-20T19:00:00", data: current },
        ],
      ],
    });
    await renderStats("juniors=0");
    expect(screen.queryByText("Not enough history to chart a trend yet")).toBeNull();
  });

  it("an empty history explains why there's no trend instead of drawing a lone point", async () => {
    stubApi();
    await renderStats();
    expect(screen.getAllByText("Not enough history to chart a trend yet").length).toBeGreaterThan(0);
    expect(screen.getByText("Not enough history in this range to chart a trend yet")).toBeTruthy();
  });

  it("shows how each level moved over the range", async () => {
    stubApi({
      "/stats/history": [
        [{ date: "2026-08-01T19:00:00", data: { ...current, badges: breakdown(16).badges } }],
      ],
    });
    await renderStats();
    // Heartstart went from 15 to 19.
    expect(screen.getByLabelText("+4 cadets at Heartstart since 1 Aug")).toBeTruthy();
    // And the section says what those figures mean.
    expect(
      screen.getByText(/\+\/− beside a level is the change in cadets holding it since 1 Aug/)
    ).toBeTruthy();
  });

  it("puts the strength change since the range started on the headline tile", async () => {
    stubApi({
      "/stats/history": [[{ date: "2026-08-01T19:00:00", data: { ...current, total_cadets: 23 } }]],
    });
    await renderStats();
    expect(screen.getByText("-3 since 1 Aug")).toBeTruthy();
  });
});

describe("lists", () => {
  it("lists expiring qualifications with the days left", async () => {
    stubApi();
    await renderStats();
    const row = screen.getByText("Cat Alpha").closest("li")!;
    expect(within(row).getByText("13 days")).toBeTruthy();
    expect(within(row).getByText("St John Youth First Aid")).toBeTruthy();
  });

  it("collapses a long awards list until asked", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...awards[0], cin: 100 + i, name: `Cadet ${i}` }));
    stubApi({ "/stats/awards": [many] });
    await renderStats();
    const button = screen.getByRole("button", { name: "Show all 12" });
    await act(async () => button.click());
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeTruthy();
  });

  it("says when the range had no awards", async () => {
    stubApi({ "/stats/awards": [[]] });
    await renderStats("range=3m");
    expect(screen.getByText("No badges gained in the last 3 months.")).toBeTruthy();
  });
});

describe("failures", () => {
  it.each(["/stats/history", "/stats/awards", "/stats/expiring"])(
    "an error body from %s doesn't crash the rest of the page",
    async (path) => {
      stubApi({ [path]: [{ detail: "boom" }, 500] });
      await renderStats();
      expect(screen.getByText("Cadets on strength")).toBeTruthy();
      expect(screen.getByText("Badge progression")).toBeTruthy();
    }
  );

  it("a failed current-stats load leaves the filters usable", async () => {
    stubApi({ "/stats/current": [{ detail: "boom" }, 500] });
    await renderStats();
    expect(screen.getByRole("radiogroup", { name: "Quick time range" })).toBeTruthy();
    expect(screen.queryByText("Cadets on strength")).toBeNull();
  });
});
