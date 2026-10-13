// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RankedBars, WindowToggle } from "@/components/stores/order-stats";

describe("RankedBars", () => {
  it("shows each row with its count and share", () => {
    render(
      <RankedBars
        rows={[
          { label: "Beret", count: 3 },
          { label: "Tie", count: 1, hint: "Most common size: 7" },
        ]}
      />
    );
    expect(screen.getByText("3 · 75%")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Tie: 1" })).toBeTruthy();
    expect(screen.getByText("Most common size: 7")).toBeTruthy();
  });

  it("says so instead of dividing by zero when there are no rows", () => {
    render(<RankedBars rows={[]} empty="No items." />);
    expect(screen.getByText("No items.")).toBeTruthy();
  });

  it("shows non-ASCII names untouched", () => {
    render(<RankedBars rows={[{ label: "Béret", count: 2 }]} />);
    expect(screen.getByText("Béret")).toBeTruthy();
  });
});

describe("WindowToggle", () => {
  it("changes the range, and clicking the pressed one keeps it", () => {
    const onChange = vi.fn();
    render(<WindowToggle value="1y" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "All time" }));
    expect(onChange).toHaveBeenCalledWith("all");
    onChange.mockClear();
    fireEvent.click(screen.getByRole("radio", { name: "1 year" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
