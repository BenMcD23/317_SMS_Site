// @vitest-environment jsdom
import { act, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProgrammeTurnout } from "@/components/stats/programme-turnout";
import type { ProgrammeStats } from "@/lib/programme";
import type { TimeRange } from "@/lib/stats";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "nco", user: { email: "nco@317atc.co.uk", name: "Nina" } },
  status: "authenticated",
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const STATS: ProgrammeStats = {
  days: 182,
  nights: [
    {
      date: "2026-10-07",
      rate: 75,
      present: 30,
      total: 40,
      uniform: "No.3 SD",
      sessions: [{ period: 1, flights: "A, B", activity: "Drill", category: "drill" }],
    },
  ],
  categories: [
    { key: "sport", label: "Sport and fitness", nights: 3, rate: 90, authorised_rate: 2, cadet_nights: 60 },
    {
      key: "drill",
      label: "Drill and inspection",
      nights: 5,
      rate: 61.5,
      authorised_rate: 8,
      cadet_nights: 100,
    },
  ],
  activities: [
    { name: "Map Reading 2", category: "fieldcraft", label: "Fieldcraft and adventure", times: 2, rate: 55 },
    { name: "Volleyball", category: "sport", label: "Sport and fitness", times: 3, rate: 92 },
  ],
  categories_all: [],
};

function stub(status: number, body: unknown) {
  const fetchMock = vi.fn<(url: string) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function show(range: TimeRange = { kind: "quick", id: "6m" } as TimeRange) {
  await act(async () => {
    renderWithQuery(<ProgrammeTurnout range={range} />);
  });
}

beforeEach(() => {
  // Recharts measures its container; jsdom has none, so give it a size.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

describe("ProgrammeTurnout", () => {
  it("shows turnout by kind of night, night by night and by activity, lowest first", async () => {
    stub(200, STATS);
    await show();
    expect(await screen.findByText("By kind of night")).toBeInTheDocument();
    expect(screen.getByText(/turnout across every night \(75%\)/)).toBeInTheDocument();
    expect(screen.getByText("Night by night")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Turnout by activity" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Map Reading 2"),
      expect.stringContaining("Volleyball"),
    ]);
    expect(rows[0]).toHaveTextContent("55%");
    expect(
      screen.getByRole("button", { name: "Download turnout by kind of night as CSV" })
    ).toBeInTheDocument();
  });

  it("asks for the page's range: last N days, or the custom dates", async () => {
    const fetchMock = stub(200, STATS);
    await show({ kind: "absolute", from: "2026-09-01", to: "2026-10-31" });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /\/programme\/stats\?start=2026-09-01&end=2026-10-31$/
    );
  });

  it("with nothing imported, says how nights get there", async () => {
    stub(200, { ...STATS, nights: [], categories: [], activities: [] });
    await show();
    expect(await screen.findByText("No programme for this period")).toBeInTheDocument();
    expect(screen.queryByText("By kind of night")).not.toBeInTheDocument();
  });

  it("with no activity run twice, says so instead of an empty table", async () => {
    stub(200, { ...STATS, activities: [] });
    await show();
    expect(await screen.findByText("No activity ran more than once in this period.")).toBeInTheDocument();
  });

  it("a failure shows its reason", async () => {
    stub(500, { detail: "Database down" });
    await show();
    expect(await screen.findByText("Database down")).toBeInTheDocument();
  });
});
