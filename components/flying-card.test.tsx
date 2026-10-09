// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FlyingCard, type Flight } from "@/components/flying-card";

const flight = (id: number, extra: Partial<Flight>): Flight => ({
  id,
  date: "2025-08-06",
  activity: "powered",
  aircraft: "Tutor",
  category: "AEF",
  duty: null,
  sortie: null,
  unit: null,
  minutes: null,
  ...extra,
});

const STAGES = [
  { stage: 1, name: "Blue aviation (ATP ground school)", done: true },
  { stage: 2, name: "Blue PTT (simulator)", done: false },
  { stage: 3, name: "Flight in a Grob Tutor or Viking", done: true },
];

describe("FlyingCard", () => {
  it("lists flights with their aircraft, duty, unit and time, and totals the time", () => {
    render(
      <FlyingCard
        stages={STAGES}
        flights={[
          flight(1, {
            duty: "Blue ATP",
            sortie: "Sortie 1 - AEF",
            unit: "11 AEF (RAF Leeming)",
            minutes: 25,
          }),
          flight(2, { activity: "gliding", aircraft: "Viking", date: "2026-09-27", minutes: 50 }),
        ]}
      />
    );
    const list = screen.getByRole("list", { name: "Flights" });
    expect(list.textContent).toContain("Tutor · Blue ATP");
    expect(list.textContent).toContain("Sortie 1 - AEF · 11 AEF (RAF Leeming)");
    expect(list.textContent).toContain("6 Aug 2025");
    expect(screen.getByText("2 flights · 1h 15m")).toBeTruthy();
  });

  it("names a simulator session as such rather than as an aircraft", () => {
    render(
      <FlyingCard
        stages={[]}
        flights={[flight(1, { activity: "simulator", aircraft: "PTT", minutes: null })]}
      />
    );
    expect(screen.getByText("Simulator (PTT)")).toBeTruthy();
  });

  it("shows how far through Blue Flying the cadet is", () => {
    render(<FlyingCard stages={STAGES} flights={[]} />);
    const stages = screen.getByRole("region", { name: "Blue Flying stages" });
    expect(stages.textContent).toContain("2 of 3 stages");
    expect(within(stages).getAllByLabelText("Not done")).toHaveLength(1);
  });

  it("says when every stage is done", () => {
    render(<FlyingCard stages={STAGES.map((s) => ({ ...s, done: true }))} flights={[]} />);
    expect(screen.getByText(/all stages done/)).toBeTruthy();
  });

  it("says when the cadet has never flown", () => {
    render(<FlyingCard stages={[]} flights={[]} />);
    expect(screen.getByText("No flights recorded on the Volunteer Portal.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Blue Flying stages" })).toBeNull();
  });
});
