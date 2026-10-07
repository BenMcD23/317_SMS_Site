// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { shareValue, StackTooltip } from "@/components/stats/charts";
import { flightColor, flightLabel, levelColor } from "@/lib/stats";

// Recharts hands the tooltip its series bottom of the stack first.
const levels = [
  { dataKey: "Blue", value: 30, payload: { "n:Blue": 6, "n:None": 14 } },
  { dataKey: "None", value: 70, payload: { "n:Blue": 6, "n:None": 14 } },
];

describe("StackTooltip", () => {
  // The bug: the default tooltip coloured each row with the series stroke,
  // the card colour, so hovering showed an empty box.
  it("shows every series with its value in text colours, top band first", () => {
    render(
      <StackTooltip active label="2026-08-05" payload={levels} colorFor={levelColor} valueFor={shareValue} />
    );
    const tip = screen.getByRole("tooltip");
    expect(within(tip).getByText("5 Aug")).toBeTruthy();
    const rows = within(tip).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual(["None70% (14)", "Blue30% (6)"]);
    for (const row of rows) expect(row.getAttribute("style")).toBeNull();
  });

  it("names flights in the strength chart", () => {
    render(
      <StackTooltip
        active
        label="2026-08-05"
        payload={[
          { dataKey: "Unknown", value: 2 },
          { dataKey: "A", value: 18 },
        ]}
        colorFor={flightColor}
        nameFor={flightLabel}
      />
    );
    expect(screen.getAllByRole("listitem").map((r) => r.textContent)).toEqual(["A Flight18", "No flight2"]);
  });

  it("renders nothing when not hovering", () => {
    const { container } = render(<StackTooltip active={false} payload={levels} colorFor={levelColor} />);
    expect(container.innerHTML).toBe("");
  });

  it("a point with no count reads as zero, not undefined", () => {
    expect(shareValue({ value: 0, payload: {} }, "Gold")).toBe("0% (0)");
  });
});
