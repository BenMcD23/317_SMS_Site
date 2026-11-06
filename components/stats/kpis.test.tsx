// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SquadronKpis } from "@/components/stats/kpis";
import type { SquadronStats } from "@/lib/stats";

function stats(by_flight: Record<string, number>): SquadronStats {
  return {
    total_cadets: Object.values(by_flight).reduce((a, b) => a + b, 0),
    by_flight,
    by_rank: { Cadet: 10, Cpl: 2 },
  } as unknown as SquadronStats;
}

describe("the Flights tile follows the flights the scraper found", () => {
  it("counts and lists however many there are, in squadron order", () => {
    render(<SquadronKpis stats={stats({ C: 5, A: 7, NCO: 3, B: 6, D: 2 })} />);
    expect(screen.getByText("5")).toBeTruthy(); // five flights including NCO
    expect(screen.getByText("3 NCO · 7 A · 6 B · 5 C · 2 D")).toBeTruthy();
  });

  it("copes with a squadron of two flights", () => {
    render(<SquadronKpis stats={stats({ B: 4, A: 9 })} />);
    expect(screen.getByText("9 A · 4 B")).toBeTruthy();
  });

  it("shows nothing to list when there are no flights", () => {
    render(<SquadronKpis stats={stats({})} />);
    expect(screen.getByText("Flights")).toBeTruthy();
  });
});
