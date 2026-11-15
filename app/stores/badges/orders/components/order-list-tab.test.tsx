// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BadgeOrderListTab } from "@/app/stores/badges/orders/components/order-list-tab";
import type { BadgeOrderListEntry } from "@/lib/stores-types";

function entry(id: string, badgeName: string, cadetName: string, extra: Partial<BadgeOrderListEntry> = {}) {
  return {
    id,
    badgeName,
    cadetName,
    orderItemId: null,
    addedAt: "2026-10-01T18:00:00Z",
    addedBy: "Sam Staff",
    orderedAt: null,
    orderedBy: null,
    receivedAt: null,
    receivedBy: null,
    history: [],
    ...extra,
  } as unknown as BadgeOrderListEntry;
}

const ACTIONS = {
  resolveEntry: () => undefined,
  onGoTo: vi.fn(),
  onRemove: vi.fn(),
  onMarkOrdered: vi.fn(),
  onMarkReceived: vi.fn(),
  markingOrderedId: null,
  markingReceivedId: null,
  onAddNote: vi.fn(async () => {}),
  onDeleteNote: vi.fn(),
};

describe("badge Order List tab", () => {
  it("copies the To Order list as one 'badge — cadet' line each, for the supplier email", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(
      <BadgeOrderListTab
        {...ACTIONS}
        toOrder={[entry("a", "First Aid – Blue", "Amy Able"), entry("b", "Squadron", "Ben Bell")]}
        ordered={[]}
        received={[]}
      />
    );
    await user.click(screen.getByRole("button", { name: "Copy List" }));
    expect(writeText).toHaveBeenCalledWith("First Aid – Blue — Amy Able\nSquadron — Ben Bell");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("says how to fill an empty list, and that nothing is on order", () => {
    render(<BadgeOrderListTab {...ACTIONS} toOrder={[]} ordered={[]} received={[]} />);
    expect(screen.getByText(/No badges queued/)).toBeInTheDocument();
    expect(screen.getByText("Nothing on order.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy List" })).toBeNull();
  });

  it("keeps received badges folded away until asked", async () => {
    const user = userEvent.setup();
    render(
      <BadgeOrderListTab
        {...ACTIONS}
        toOrder={[]}
        ordered={[]}
        received={[entry("r", "Squadron", "Ben Bell", { orderedAt: "2026-10-02", receivedAt: "2026-10-09" })]}
      />
    );
    expect(screen.queryByText("Squadron")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("Squadron")).toBeInTheDocument();
  });

  it("moves a queued badge on with Mark as Ordered, and an ordered one with Mark as Received", async () => {
    const user = userEvent.setup();
    const onMarkOrdered = vi.fn();
    const onMarkReceived = vi.fn();
    render(
      <BadgeOrderListTab
        {...ACTIONS}
        onMarkOrdered={onMarkOrdered}
        onMarkReceived={onMarkReceived}
        toOrder={[entry("a", "First Aid – Blue", "Amy Able")]}
        ordered={[entry("b", "Squadron", "Ben Bell", { orderedAt: "2026-10-02" })]}
        received={[]}
      />
    );
    await user.click(screen.getByRole("button", { name: "Mark as Ordered" }));
    expect(onMarkOrdered).toHaveBeenCalledWith("a");
    await user.click(screen.getByRole("button", { name: "Mark as Received" }));
    expect(onMarkReceived).toHaveBeenCalledWith("b");
  });

  it("says when an entry's original order has gone, rather than linking nowhere", () => {
    render(
      <BadgeOrderListTab
        {...ACTIONS}
        toOrder={[entry("a", "Squadron", "Amy Able")]}
        ordered={[]}
        received={[]}
      />
    );
    const row = within(screen.getByText("Squadron").closest("li")!);
    expect(row.getByText("Original order no longer available")).toBeInTheDocument();
    expect(row.queryByRole("button", { name: /Go to/ })).toBeNull();
  });
});
