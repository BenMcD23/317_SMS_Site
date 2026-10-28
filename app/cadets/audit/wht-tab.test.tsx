// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok", role: "staff" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));

import { filterCadets, WhtAuditTab, type WhtCadet } from "@/app/cadets/audit/wht-tab";

const WEAPONS = ["L98A2", "Scorpion (magazine fed)", "Scorpion (single shot)"];

function wht(weapon: string, status: "current" | "expired", expires: string | null = "2027-01-01") {
  return {
    weapon,
    date_passed: "2026-07-01",
    date_expires: expires,
    awarded_by: "Doherty, S Flt Lt",
    status,
  };
}

function cadet(cin: number, last: string, tests: ReturnType<typeof wht>[]): WhtCadet {
  return {
    cin,
    first_name: "A",
    last_name: last,
    rank: null,
    flight: "A",
    latest: Object.fromEntries(tests.map((t) => [t.weapon, t])),
    history: tests,
  };
}

const AMY = cadet(1, "Able", [
  wht("L98A2", "current"),
  wht("Scorpion (single shot)", "expired", "2025-09-28"),
]);
const BOB = cadet(2, "Brown", [wht("L98A2", "expired", "2025-02-02")]);
const CAT = cadet(3, "Cole", []);
const ALL = [AMY, BOB, CAT];

describe("WHT audit filters", () => {
  it("any status keeps everyone", () => {
    expect(filterCadets(ALL, WEAPONS, true, "all")).toEqual(ALL);
  });

  it("current or expired on one weapon looks at that weapon only", () => {
    expect(filterCadets(ALL, ["L98A2"], false, "current")).toEqual([AMY]);
    expect(filterCadets(ALL, ["L98A2"], false, "expired")).toEqual([BOB]);
  });

  it("never tested on one weapon includes cadets tested on others", () => {
    expect(filterCadets(ALL, ["Scorpion (single shot)"], false, "never")).toEqual([BOB, CAT]);
  });

  it("never tested over all weapons means no WHT at all", () => {
    expect(filterCadets(ALL, WEAPONS, true, "never")).toEqual([CAT]);
  });

  it("not current catches expired and never tested", () => {
    expect(filterCadets(ALL, ["L98A2"], false, "not-current")).toEqual([BOB, CAT]);
  });
});

describe("WHT audit tab", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function show(response: Response) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response)
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      render(
        <QueryClientProvider client={client}>
          <WhtAuditTab />
        </QueryClientProvider>
      );
    });
  }

  it("shows each weapon's counts, each cadet's state, and their history on demand", async () => {
    await show(new Response(JSON.stringify({ weapons: WEAPONS, cadets: ALL })));
    expect(await screen.findByText("1 current · 1 expired · 1 never tested")).toBeInTheDocument();
    expect(screen.getByText("Until 1 Jan 2027")).toBeInTheDocument();
    expect(screen.getByText("Expired 2 Feb 2025")).toBeInTheDocument();
    // Cat has no history, so no button.
    expect(screen.getAllByRole("button", { name: /History/ })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "History (2)" }));
    expect(screen.getByText(/expired 28 Sept 2025/)).toBeInTheDocument();
  });

  it("an expired test with no expiry date says so", async () => {
    const dan = cadet(4, "Dunn", [wht("L98A2", "expired", null)]);
    await show(new Response(JSON.stringify({ weapons: WEAPONS, cadets: [dan] })));
    expect(await screen.findByText("No expiry date")).toBeInTheDocument();
  });

  it("an API error is shown, not an empty table", async () => {
    await show(new Response(JSON.stringify({ detail: "nope" }), { status: 500 }));
    expect(await screen.findByText("Couldn't load WHTs")).toBeInTheDocument();
  });
});
