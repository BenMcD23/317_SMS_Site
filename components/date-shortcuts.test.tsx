// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DateShortcuts, dayBefore } from "@/components/date-shortcuts";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Just after midnight in summer: UTC is still yesterday, the shortcut mustn't be.
  vi.setSystemTime(new Date("2026-07-15T00:30:00+01:00"));
});
afterEach(() => vi.useRealTimers());

describe("DateShortcuts", () => {
  it("offers Today and Yesterday in local time and sets the one tapped", async () => {
    const onChange = vi.fn();
    render(<DateShortcuts value="2026-07-01" onChange={onChange} yesterday />);
    await userEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-07-15");
    await userEvent.click(screen.getByRole("button", { name: "Yesterday" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-07-14");
  });

  it("doesn't offer the date that's already set, and shows nothing when there's nothing to change to", () => {
    const { rerender, container } = render(
      <DateShortcuts value="2026-07-15" onChange={() => {}} yesterday />
    );
    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yesterday" })).toBeInTheDocument();
    rerender(<DateShortcuts value="2026-07-15" onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("works out the day before across month and year ends", () => {
    expect(dayBefore("2026-03-01")).toBe("2026-02-28");
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
  });
});
