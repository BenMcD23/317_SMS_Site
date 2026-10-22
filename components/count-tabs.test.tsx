// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CountTabs } from "@/components/count-tabs";

const TABS = [
  { value: "active", label: "Active", count: 4 },
  { value: "completed", label: "Completed", count: 0 },
] as const;

describe("CountTabs", () => {
  it("shows each tab's count, zero included", () => {
    render(<CountTabs tabs={[...TABS]} value="active" onValueChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Active 4" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Completed 0" })).toHaveAttribute("aria-selected", "false");
  });

  it("hides counts while loading rather than showing a misleading 0", () => {
    render(<CountTabs tabs={[...TABS]} value="active" onValueChange={() => {}} loading />);
    expect(screen.getByRole("tab", { name: "Completed" })).toBeInTheDocument();
  });

  it("reports the chosen tab, by mouse or keyboard", async () => {
    const onValueChange = vi.fn();
    render(<CountTabs tabs={[...TABS]} value="active" onValueChange={onValueChange} />);
    await userEvent.click(screen.getByRole("tab", { name: /Completed/ }));
    expect(onValueChange).toHaveBeenLastCalledWith("completed");

    onValueChange.mockClear();
    screen.getByRole("tab", { name: /Active/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onValueChange).toHaveBeenLastCalledWith("completed");
  });
});
