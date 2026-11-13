// @vitest-environment jsdom
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MonthPicker, shiftMonth, type MonthValue } from "@/components/month-picker";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-13T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

function Harness({ initial, min, max }: { initial: MonthValue; min?: MonthValue; max?: MonthValue }) {
  const [value, setValue] = useState(initial);
  return <MonthPicker value={value} onChange={setValue} min={min} max={max} />;
}

describe("MonthPicker", () => {
  it("steps a month at a time across the year end, and names where each arrow goes", async () => {
    render(<Harness initial={{ month: 12, year: 2026 }} />);
    const group = screen.getByRole("group", { name: "Month" });
    expect(group).toHaveTextContent("December 2026");
    await userEvent.click(screen.getByRole("button", { name: "January 2027" }));
    expect(group).toHaveTextContent("January 2027");
    await userEvent.click(screen.getByRole("button", { name: "December 2026" }));
    expect(group).toHaveTextContent("December 2026");
  });

  it("goes back to this month in one tap, offered only when you've moved away", async () => {
    render(<Harness initial={{ month: 3, year: 2025 }} />);
    await userEvent.click(screen.getByRole("button", { name: "This month" }));
    expect(screen.getByRole("group", { name: "Month" })).toHaveTextContent("November 2026");
    expect(screen.queryByRole("button", { name: "This month" })).not.toBeInTheDocument();
  });

  it("stops at the first and last months there's anything for", () => {
    render(
      <Harness
        initial={{ month: 1, year: 2025 }}
        min={{ month: 1, year: 2025 }}
        max={{ month: 1, year: 2025 }}
      />
    );
    expect(screen.getByRole("button", { name: "December 2024" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "February 2025" })).toBeDisabled();
  });

  it("shifts months both ways", () => {
    expect(shiftMonth({ month: 1, year: 2026 }, -1)).toEqual({ month: 12, year: 2025 });
    expect(shiftMonth({ month: 11, year: 2026 }, 14)).toEqual({ month: 1, year: 2028 });
  });
});
