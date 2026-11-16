// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GivenProgress, OrderItemList, OrderItemRow } from "@/components/order-item-row";

type Props = React.ComponentProps<typeof OrderItemRow>;
const BASE: Props = {
  name: "Beret",
  status: { label: "In stock", tone: "progress" },
  given: false,
  onToggleGiven: vi.fn(),
};
const renderRow = (over: Partial<Props> = {}) =>
  render(
    <OrderItemList>
      <OrderItemRow {...BASE} {...over} />
    </OrderItemList>
  );

describe("OrderItemRow", () => {
  it("hands the item out with one tap on its tick, which reads as a checkbox", async () => {
    const onToggleGiven = vi.fn();
    renderRow({ onToggleGiven });
    const tick = screen.getByRole("checkbox", { name: "Given: Beret" });
    expect(tick).toHaveAttribute("aria-checked", "false");
    await userEvent.click(tick);
    expect(onToggleGiven).toHaveBeenCalledOnce();
  });

  it("shows a given item ticked, and lets it be unticked", async () => {
    const onToggleGiven = vi.fn();
    renderRow({ given: true, status: { label: "Given", tone: "done" }, onToggleGiven });
    const tick = screen.getByRole("checkbox", { name: "Given: Beret" });
    expect(tick).toHaveAttribute("aria-checked", "true");
    await userEvent.click(tick);
    expect(onToggleGiven).toHaveBeenCalledOnce();
  });

  it("won't tick an item that can't go out yet, and says why", () => {
    renderRow({ giveDisabledReason: "Needs a size first" });
    const tick = screen.getByRole("checkbox", { name: "Given: Beret" });
    expect(tick).toBeDisabled();
    expect(tick).toHaveAttribute("title", "Needs a size first");
  });

  it("says where the item is up to in words, not just colour", () => {
    renderRow({ status: { label: "Ready to collect", tone: "ready" } });
    expect(screen.getByText("Ready to collect")).toBeInTheDocument();
  });

  it("offers one next step as a button, and the rest in its menu", async () => {
    const next = vi.fn();
    const del = vi.fn();
    renderRow({
      next: { label: "Take from stock", onSelect: next },
      menu: [
        { label: "Edit size", onSelect: vi.fn() },
        "separator",
        { label: "Delete item", onSelect: del, destructive: true },
      ],
    });
    await userEvent.click(screen.getByRole("button", { name: "Take from stock" }));
    expect(next).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: "More for Beret" }));
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Edit size", "Delete item"]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete item" }));
    expect(del).toHaveBeenCalledOnce();
  });

  it("can't press a step twice while it's working", () => {
    renderRow({ next: { label: "Take from stock", onSelect: vi.fn(), busy: true } });
    expect(screen.getByRole("button", { name: /Take from stock/ })).toBeDisabled();
  });

  it("keeps the history folded away until asked for", async () => {
    renderRow({ history: <p>Taken from stock by Sam</p> });
    expect(screen.queryByText("Taken from stock by Sam")).toBeNull();
    const toggle = screen.getByRole("button", { name: "History" });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Taken from stock by Sam")).toBeInTheDocument();
  });

  it("on a completed order shows everything but changes nothing", () => {
    renderRow({
      readOnly: true,
      given: true,
      next: { label: "Take from stock", onSelect: vi.fn() },
      menu: [{ label: "Delete item", onSelect: vi.fn() }],
    });
    expect(screen.getByRole("checkbox", { name: "Given: Beret" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Take from stock" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More for Beret" })).toBeNull();
  });

  it("shows a spinner on the tick while the hand-over is saving, and can't be tapped again", () => {
    renderRow({ giving: true });
    const tick = screen.getByRole("checkbox", { name: "Given: Beret" });
    expect(tick).toBeDisabled();
    expect(within(tick).queryByRole("status") ?? tick.querySelector("svg")).toBeTruthy();
  });
});

describe("GivenProgress", () => {
  const items = (given: number, of: number) =>
    Array.from({ length: of }, (_, i) => ({ givenAt: i < given ? "2026-11-16T19:00:00Z" : null }));

  it("says nothing before the first hand-over", () => {
    const { container } = render(<GivenProgress items={items(0, 3)} completed={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("counts the hand-overs, then says when all are done", () => {
    const { rerender } = render(<GivenProgress items={items(1, 3)} completed={false} />);
    expect(screen.getByText("1 of 3 given")).toBeInTheDocument();
    rerender(<GivenProgress items={items(3, 3)} completed={false} />);
    expect(screen.getByText("All given")).toBeInTheDocument();
  });

  it("says nothing on a completed order, which is all given by definition", () => {
    const { container } = render(<GivenProgress items={items(3, 3)} completed />);
    expect(container).toBeEmptyDOMElement();
  });
});
