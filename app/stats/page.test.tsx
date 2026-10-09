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
  "/stats/funnel": [{ total: 0, steps: [] }],
  "/stats/retention": [[]],
  "/stats/targets": [[]],
  "/stats/badge-levels": [{ first_aid: ["Blue", "Bronze", "Silver", "Gold"] }],
};

// Keys are a path ("GET" implied) or "METHOD /path".
function stubApi(over: Routes = {}) {
  const routes = { ...OK, ...over };
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const hit = Object.entries(routes).find(([key]) => {
      const [m, path] = key.includes(" ") ? key.split(" ") : ["GET", key];
      return m === method && String(url).includes(path);
    });
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
  SESSION.data.role = "nco";
  // Radix's checkbox measures itself; jsdom has no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
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

describe("stepping and zooming the range", () => {
  it("steps a preset back into the same-length range before it", async () => {
    stubApi();
    await renderStats("range=1m");
    await act(async () => screen.getByRole("button", { name: "Earlier time range" }).click());
    // Last month is 2 Sept–2 Oct (31 days); the one before ends the day before.
    expect(lastUrl()).toBe("/stats?from=2026-08-02&to=2026-09-01");
  });

  it("steps forward from a past range, and can't step past today", async () => {
    stubApi();
    await renderStats("from=2026-08-02&to=2026-09-01");
    await act(async () => screen.getByRole("button", { name: "Later time range" }).click());
    expect(lastUrl()).toBe("/stats?from=2026-09-02&to=2026-10-02");

    await renderStats("range=1m");
    expect(screen.getAllByRole("button", { name: "Later time range" }).at(-1)!.hasAttribute("disabled")).toBe(
      true
    );
  });

  it("zooms out to twice the length", async () => {
    stubApi();
    await renderStats("from=2026-03-10&to=2026-03-19");
    await act(async () => screen.getByRole("button", { name: "Zoom out" }).click());
    expect(lastUrl()).toBe("/stats?from=2026-03-05&to=2026-03-24");
  });

  it("all time has nowhere to step or zoom", async () => {
    stubApi();
    await renderStats("range=all");
    for (const name of ["Earlier time range", "Later time range", "Zoom out"])
      expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
  });
});

const drillBody = {
  as_of: null,
  cadets: [
    {
      cin: 7,
      name: "Zoë Ó Briain",
      flight: "A",
      rank: "Cpl",
      classification: "Leading Cadet",
      junior: false,
      level: "Heartstart",
    },
  ],
};

describe("click-through to cadets", () => {
  it("clicking a badge level lists those cadets, following the page's filters", async () => {
    const fetch = stubApi({ "/stats/cadets": [drillBody] });
    await renderStats("flight=A&juniors=0");
    await act(async () => screen.getByRole("button", { name: "Heartstart: 4 — show these cadets" }).click());
    for (let i = 0; i < 3; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Heartstart First Aid")).toBeTruthy();
    expect(within(dialog).getByText("Zoë Ó Briain")).toBeTruthy();
    expect(
      requested(fetch, "/stats/cadets?badge=first_aid&level=Heartstart&flight=A&exclude_juniors=true")
    ).toBe(true);
  });

  it("a past range lists cadets as they stood at its end", async () => {
    const fetch = stubApi({
      "/stats/cadets": [{ ...drillBody, as_of: "2026-04-12T21:00:00" }],
      "/stats/history": [[{ date: "2026-04-12T21:00:00", data: current }]],
    });
    await renderStats("from=2026-03-01&to=2026-04-15");
    await act(async () => screen.getByRole("button", { name: "Heartstart: 19 — show these cadets" }).click());
    for (let i = 0; i < 3; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
    expect(requested(fetch, "&on=2026-04-15")).toBe(true);
    expect(screen.getByText(/As of the snapshot taken 12 Apr 2026/)).toBeTruthy();
  });

  it("explains when there's no per-cadet history that far back", async () => {
    stubApi({
      "/stats/cadets": [{ detail: "No per-cadet snapshot on or before that day" }, 404],
      "/stats/history": [[{ date: "2026-04-12T21:00:00", data: current }]],
    });
    await renderStats("from=2026-03-01&to=2026-04-15");
    await act(async () => screen.getByRole("button", { name: "Heartstart: 19 — show these cadets" }).click());
    for (let i = 0; i < 3; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
    expect(screen.getByRole("alert").textContent).toContain("no per-cadet history from that far back");
  });

  it.each([
    ["staff", true],
    ["nco", false],
  ])("%s %s link through to cadet records", async (role, links) => {
    SESSION.data.role = role;
    stubApi({ "/stats/cadets": [drillBody] });
    await renderStats();
    await act(async () => screen.getByRole("button", { name: "Heartstart: 19 — show these cadets" }).click());
    for (let i = 0; i < 3; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
    expect(!!within(screen.getByRole("dialog")).queryByRole("link", { name: "Zoë Ó Briain" })).toBe(links);
  });
});

const funnel = {
  total: 20,
  steps: [
    {
      name: "Junior Cadet",
      reached: 20,
      pct_of_previous: null,
      median_days_from_previous: null,
      timed_cadets: 0,
    },
    {
      name: "First Class Cadet",
      reached: 9,
      pct_of_previous: 45,
      median_days_from_previous: 70,
      timed_cadets: 3,
    },
    {
      name: "Leading Cadet",
      reached: 0,
      pct_of_previous: 0,
      median_days_from_previous: null,
      timed_cadets: 0,
    },
  ],
};

describe("classification funnel", () => {
  it("shows each step's count, share of the step before, and typical time", async () => {
    stubApi({ "/stats/funnel": [funnel] });
    await renderStats();
    expect(screen.getByText("45% of the step before · typically 10 weeks (3 timed)")).toBeTruthy();
  });

  it("follows the flight filter", async () => {
    const fetch = stubApi({ "/stats/funnel": [funnel] });
    await renderStats("flight=B");
    expect(requested(fetch, "/stats/funnel?flight=B")).toBe(true);
  });

  it("clicking a step lists everyone who reached it", async () => {
    const fetch = stubApi({ "/stats/funnel": [funnel], "/stats/cadets": [drillBody] });
    await renderStats();
    // Nobody to list for an empty step.
    expect(
      screen
        .getByRole("button", { name: "Leading Cadet: 0 reached — show these cadets" })
        .hasAttribute("disabled")
    ).toBe(true);
    await act(async () =>
      screen.getByRole("button", { name: "First Class Cadet: 9 reached — show these cadets" }).click()
    );
    expect(requested(fetch, "/stats/cadets?min_classification=First+Class+Cadet")).toBe(true);
  });

  it("an error body doesn't crash the page", async () => {
    stubApi({ "/stats/funnel": [{ detail: "boom" }, 500] });
    await renderStats();
    expect(screen.getByText("Classification funnel")).toBeTruthy();
  });
});

describe("intake retention", () => {
  it("shows each intake with shares still coming, and dashes until a mark is reached", async () => {
    stubApi({
      "/stats/retention": [[{ intake: "2026-04", joined: 4, still_on_strength: 3, "6m": 3, "12m": null }]],
    });
    await renderStats();
    const row = screen.getByText("Apr 2026").closest("tr")!;
    expect(
      within(row)
        .getAllByRole("cell")
        .map((c) => c.textContent)
    ).toEqual(["Apr 2026", "4", "3 (75%)", "—", "3 (75%)"]);
  });

  it("explains an empty history", async () => {
    stubApi();
    await renderStats();
    expect(screen.getByText(/No intakes yet/)).toBeTruthy();
  });
});

const targetRow = {
  id: 3,
  badge: "first_aid",
  min_level: null,
  flight: null,
  exclude_juniors: false,
  target_pct: 50,
  due: "2027-07-01",
  levels: ["Heartstart"],
  created_by: "staff@317atc.co.uk",
};

describe("targets", () => {
  it("NCOs see targets but can't add or delete them", async () => {
    stubApi({ "/stats/targets": [[targetRow]] });
    await renderStats();
    expect(screen.getByText("50% of cadets with First Aid by 1 Jul 2027")).toBeTruthy();
    // 19 of 20 hold it: met.
    expect(screen.getByText("Target met")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add target" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete target/ })).toBeNull();
  });

  it("NCOs don't see an empty targets section at all", async () => {
    stubApi();
    await renderStats();
    expect(screen.queryByText("Targets")).toBeNull();
  });

  it("staff add a target", async () => {
    SESSION.data.role = "staff";
    const fetch = stubApi({ "POST /stats/targets": [targetRow, 201] });
    await renderStats();
    await act(async () => screen.getByRole("button", { name: "Add target" }).click());
    fireEvent.change(screen.getByLabelText("Target %"), { target: { value: "75" } });
    fireEvent.change(screen.getByLabelText("By"), { target: { value: "2027-07-01" } });
    await act(async () =>
      within(screen.getByRole("dialog")).getByRole("button", { name: "Add target" }).click()
    );
    const post = fetch.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
      badge: "first_aid",
      min_level: null,
      flight: null,
      exclude_juniors: true,
      target_pct: 75,
      due: "2027-07-01",
    });
  });

  it("Add without a due date says to pick one instead of sitting greyed out", async () => {
    SESSION.data.role = "staff";
    const fetch = stubApi();
    await renderStats();
    await act(async () => screen.getByRole("button", { name: "Add target" }).click());
    const dialog = screen.getByRole("dialog");
    // Nothing nags before the user has tried to save.
    expect(within(dialog).queryByRole("alert")).toBeNull();
    const add = within(dialog).getByRole("button", { name: "Add target" });
    expect(add.hasAttribute("disabled")).toBe(false);
    await act(async () => add.click());
    expect(within(dialog).getByRole("alert").textContent).toBe("Pick a due date");
    expect(fetch.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(
      false
    );
  });

  it("a target the API rejects keeps the dialog open", async () => {
    SESSION.data.role = "staff";
    stubApi({ "POST /stats/targets": [{ detail: "Unknown badge 'first_aid'" }, 400] });
    await renderStats();
    await act(async () => screen.getByRole("button", { name: "Add target" }).click());
    fireEvent.change(screen.getByLabelText("By"), { target: { value: "2027-07-01" } });
    await act(async () =>
      within(screen.getByRole("dialog")).getByRole("button", { name: "Add target" }).click()
    );
    const add = within(screen.getByRole("dialog")).getByRole("button", { name: "Add target" });
    expect(add.hasAttribute("disabled")).toBe(false);
  });

  it("won't submit a target outside 1–100%", async () => {
    SESSION.data.role = "staff";
    stubApi();
    await renderStats();
    await act(async () => screen.getByRole("button", { name: "Add target" }).click());
    fireEvent.change(screen.getByLabelText("Target %"), { target: { value: "150" } });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("alert").textContent).toBe("Target must be 1–100%");
    expect(within(dialog).getByRole("button", { name: "Add target" }).hasAttribute("disabled")).toBe(true);
  });

  it("staff delete a target after confirming", async () => {
    SESSION.data.role = "staff";
    const fetch = stubApi({ "/stats/targets": [[targetRow]], "DELETE /stats/targets/3": [null, 204] });
    await renderStats();
    await act(async () =>
      screen
        .getByRole("button", { name: "Delete target: 50% of cadets with First Aid by 1 Jul 2027" })
        .click()
    );
    expect(fetch.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")).toBe(
      false
    );
    await act(async () =>
      within(screen.getByRole("dialog"))
        .getByRole("button", { name: /confirm|delete|yes/i })
        .click()
    );
    expect(
      fetch.mock.calls.some(
        ([url, init]) => String(url).endsWith("/stats/targets/3") && (init as RequestInit).method === "DELETE"
      )
    ).toBe(true);
  });
});

describe("CSV downloads", () => {
  it.each([
    ["Download strength as CSV", "strength-over-time.csv"],
    ["Download badges gained as CSV", "badges-gained.csv"],
    ["Download expiring qualifications as CSV", "expiring-qualifications.csv"],
    ["Download badge progression as CSV", "badge-progression.csv"],
    ["Download badges at a glance as CSV", "badges-at-a-glance.csv"],
  ])("%s saves %s", async (label, filename) => {
    stubApi();
    await renderStats();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let saved = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved = this.download;
    });
    screen.getByRole("button", { name: label }).click();
    expect(saved).toBe(filename);
  });

  it("the badges gained CSV follows the filters", async () => {
    stubApi();
    await renderStats("flight=B");
    let blob: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
      blob = b as Blob;
      return "blob:x";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    screen.getByRole("button", { name: "Download badges gained as CSV" }).click();
    const text = await blob!.text();
    expect(text).toContain("Ben Bravo");
    expect(text).not.toContain("Ann Alpha");
  });
});

describe("training progress", () => {
  const progress = {
    total: 10,
    flown_last_year: 4,
    blue_flying: { done: 3, needs_ptt: 2, needs_flight: 0, needs_ptt_and_flight: 1, not_started: 4 },
    exams: [
      { key: "acp_34_2", name: "Airmanship", category: "Leading", cadets: 4, passed: 3 },
      { key: "acp_33_2", name: "Principles of Flight", category: "Leading", cadets: 4, passed: 0 },
      { key: "rocketry", name: "Rocketry", category: "Senior/Master", cadets: 2, passed: 2 },
    ],
    service: {
      "Under 6 months": 2,
      "6–12 months": 0,
      "1–2 years": 5,
      "2–3 years": 0,
      "3+ years": 1,
      "Not synced": 2,
    },
  };

  it("shows the Blue Flying pipeline and who has flown this year", async () => {
    stubApi({ "/stats/progress": [progress] });
    await renderStats();
    expect(screen.getByText(/4 of 10 cadets have flown in the last year/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Needs PTT: 2 — show these cadets" })).toBeTruthy();
    // Nobody to list for an empty state.
    expect(
      screen.getByRole("button", { name: "Needs a flight: 0 — show these cadets" }).hasAttribute("disabled")
    ).toBe(true);
  });

  it("a Blue Flying bar lists those cadets under the page's filters", async () => {
    const fetch = stubApi({ "/stats/progress": [progress], "/stats/cadets": [drillBody] });
    await renderStats("flight=B&juniors=0");
    expect(requested(fetch, "/stats/progress?flight=B&exclude_juniors=true")).toBe(true);
    await act(async () => screen.getByRole("button", { name: "Needs PTT: 2 — show these cadets" }).click());
    expect(requested(fetch, "/stats/cadets?blue_flying=needs_ptt&flight=B&exclude_juniors=true")).toBe(true);
  });

  it("an exam bar lists who still has to pass it — even when nobody has yet", async () => {
    const fetch = stubApi({ "/stats/progress": [progress], "/stats/cadets": [drillBody] });
    await renderStats();
    // Everyone's passed Rocketry: nothing to open. (Checked before the dialog
    // opens, which hides the rest of the page from queries.)
    expect(
      screen.getByRole("button", { name: "Rocketry: 2/2 — show these cadets" }).hasAttribute("disabled")
    ).toBe(true);
    const leading = screen.getByRole("region", { name: "Leading exams" });
    expect(leading.textContent).toContain("4 First Class cadets");
    await act(async () =>
      within(leading).getByRole("button", { name: "Principles of Flight: 0/4 — show these cadets" }).click()
    );
    expect(requested(fetch, "/stats/cadets?exam=acp_33_2&exam_passed=false")).toBe(true);
  });

  it("charts time at 317, leaving out cadets not yet synced", async () => {
    stubApi({ "/stats/progress": [progress] });
    await renderStats();
    expect(screen.getByText("Time at 317")).toBeTruthy();
  });

  it("an error body hides the training cards instead of crashing the page", async () => {
    stubApi({ "/stats/progress": [{ detail: "boom" }, 500] });
    await renderStats();
    expect(screen.getByText("Classification funnel")).toBeTruthy();
    expect(screen.queryByText("Blue Flying")).toBeNull();
  });
});
