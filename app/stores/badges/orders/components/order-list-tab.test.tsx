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
  onMarkMany: vi.fn(async () => true),
  markingMany: null,
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
    // The whole heading opens it, and says whether it's open.
    const heading = screen.getByRole("button", { name: /Received · 1 badge/ });
    expect(heading).toHaveAttribute("aria-expanded", "false");
    await user.click(heading);
    expect(heading).toHaveAttribute("aria-expanded", "true");
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

  it("offers no tick boxes for a single badge, whose own button does the job", () => {
    render(
      <BadgeOrderListTab
        {...ACTIONS}
        toOrder={[entry("a", "Squadron", "Amy Able")]}
        ordered={[]}
        received={[]}
      />
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("marks the whole supplier order ordered in one go, then clears the ticks", async () => {
    const user = userEvent.setup();
    const onMarkMany = vi.fn(async () => true);
    render(
      <BadgeOrderListTab
        {...ACTIONS}
        onMarkMany={onMarkMany}
        toOrder={[entry("a", "First Aid – Blue", "Amy Able"), entry("b", "Squadron", "Ben Bell")]}
        ordered={[]}
        received={[]}
      />
    );
    // Nothing ticked, nothing to press.
    expect(screen.queryByRole("button", { name: /^Mark \d+ as ordered$/ })).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    await user.click(screen.getByRole("button", { name: "Mark 2 as ordered" }));
    expect(onMarkMany).toHaveBeenCalledWith("ordered", ["a", "b"]);
    expect(screen.getByRole("checkbox", { name: "Select all" })).not.toBeChecked();
  });

  it("marks just the badges that came in a delivery received", async () => {
    const user = userEvent.setup();
    const onMarkMany = vi.fn(async () => true);
    const sent = { orderedAt: "2026-10-02" };
    render(
      <BadgeOrderListTab
        {...ACTIONS}
        onMarkMany={onMarkMany}
        toOrder={[]}
        ordered={[
          entry("a", "First Aid – Blue", "Amy Able", sent),
          entry("b", "Squadron", "Zoë Ångström", sent),
        ]}
        received={[]}
      />
    );
    await user.click(screen.getByRole("checkbox", { name: "Select Squadron for Zoë Ångström" }));
    // One of two: the select-all box shows it's part-way.
    expect(screen.getByRole("checkbox", { name: "Select all" })).toHaveAttribute(
      "data-state",
      "indeterminate"
    );
    await user.click(screen.getByRole("button", { name: "Mark 1 as received" }));
    expect(onMarkMany).toHaveBeenCalledWith("received", ["b"]);
  });

  it("keeps the ticks when the page couldn't move them, so it can be tried again", async () => {
    const user = userEvent.setup();
    const onMarkMany = vi.fn(async () => false);
    render(
      <BadgeOrderListTab
        {...ACTIONS}
        onMarkMany={onMarkMany}
        toOrder={[entry("a", "First Aid – Blue", "Amy Able"), entry("b", "Squadron", "Ben Bell")]}
        ordered={[]}
        received={[]}
      />
    );
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    await user.click(screen.getByRole("button", { name: "Mark 2 as ordered" }));
    expect(screen.getByRole("button", { name: "Mark 2 as ordered" })).toBeInTheDocument();
  });

  it("says it's working and can't be pressed twice while a bulk mark is going", async () => {
    const user = userEvent.setup();
    const props = {
      ...ACTIONS,
      toOrder: [entry("a", "First Aid – Blue", "Amy Able"), entry("b", "Squadron", "Ben Bell")],
      ordered: [],
      received: [],
    };
    const { rerender } = render(<BadgeOrderListTab {...props} />);
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    rerender(<BadgeOrderListTab {...props} markingMany="ordered" />);
    expect(screen.getByRole("button", { name: "Marking…" })).toBeDisabled();
  });
});
