// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ItemCount, OrderItemList, OrderItemRow, type ItemAction } from "@/components/order-item-row";

type Props = React.ComponentProps<typeof OrderItemRow>;
const BASE: Props = {
  name: "Beret",
  status: { label: "In stock", tone: "progress" },
  given: false,
  onToggleGiven: vi.fn(),
};
const STOCK: ItemAction = { key: "stock", label: "Remove from stock", group: "stock", onSelect: vi.fn() };
const SIZE: ItemAction = { key: "size", label: "Edit size", group: "size", onSelect: vi.fn() };
const ORDERED: ItemAction = {
  key: "ordered",
  label: "Mark as ordered",
  group: "order",
  onSelect: vi.fn(),
  doneLabel: "Ordered",
  undoLabel: "Undo ordered",
  onUndo: vi.fn(),
};
const DELETE: ItemAction = { key: "delete", label: "Delete item", group: "delete", onSelect: vi.fn() };

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

  it("on a phone shows the next step as a button, and every step in its menu in order", async () => {
    const del = vi.fn();
    const take = vi.fn();
    renderRow({
      actions: [SIZE, { ...STOCK, onSelect: take }, ORDERED, { ...DELETE, onSelect: del }],
      nextKey: "stock",
    });
    await userEvent.click(screen.getByRole("button", { name: "Remove from stock" }));
    expect(take).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: "More for Beret" }));
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual([
      "Edit size",
      "Remove from stock",
      "Mark as ordered",
      "Delete item",
    ]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete item" }));
    expect(del).toHaveBeenCalledOnce();
  });

  it("a done step offers its undo in the menu, or just says it's done if it can't be undone", async () => {
    const onUndo = vi.fn();
    renderRow({
      actions: [
        { ...ORDERED, done: true, onUndo },
        {
          key: "ready",
          label: "Ready to collect",
          group: "collect",
          onSelect: vi.fn(),
          done: true,
          doneLabel: "Cadet told",
        },
      ],
    });
    await userEvent.click(screen.getByRole("button", { name: "More for Beret" }));
    expect(screen.getByRole("menuitem", { name: "Cadet told" })).toHaveAttribute("data-disabled");
    await userEvent.click(screen.getByRole("menuitem", { name: "Undo ordered" }));
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("can't press a step twice while it's working", () => {
    renderRow({ actions: [{ ...STOCK, busy: true }], nextKey: "stock" });
    expect(screen.getByRole("button", { name: /Remove from stock/ })).toBeDisabled();
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
    renderRow({ readOnly: true, given: true, actions: [STOCK, DELETE], nextKey: "stock" });
    expect(screen.getByRole("checkbox", { name: "Given: Beret" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Remove from stock" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More for Beret" })).toBeNull();
  });

  it("shows a spinner on the tick while the hand-over is saving, and can't be tapped again", () => {
    renderRow({ giving: true });
    const tick = screen.getByRole("checkbox", { name: "Given: Beret" });
    expect(tick).toBeDisabled();
    expect(within(tick).queryByRole("status") ?? tick.querySelector("svg")).toBeTruthy();
  });
});

describe("OrderItemRow on a laptop", () => {
  // matchMedia answers "wide" for this block; jsdom has none by default.
  function wideScreen() {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(min-width: 768px)",
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  }

  it("shows every step as a button, with no menu to open", async () => {
    wideScreen();
    const del = vi.fn();
    renderRow({ actions: [SIZE, STOCK, ORDERED, { ...DELETE, onSelect: del }], nextKey: "stock" });
    expect(screen.queryByRole("button", { name: "More for Beret" })).toBeNull();
    for (const name of ["Edit size", "Remove from stock", "Mark as ordered"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole("button", { name: "Delete item" }));
    expect(del).toHaveBeenCalledOnce();
  });

  // The complaint was buttons jumping about: a step's slot never changes.
  it("keeps every step in the same place as the item moves along", () => {
    wideScreen();
    const order = () =>
      within(screen.getByRole("listitem"))
        .getAllByRole("button")
        .filter((b) => b.getAttribute("role") !== "checkbox")
        .map((b) => b.textContent);
    const { rerender } = renderRow({ actions: [STOCK, ORDERED, DELETE], nextKey: "ordered" });
    expect(order()).toEqual(["Remove from stock", "Mark as ordered", "Delete item"]);
    rerender(
      <OrderItemList>
        <OrderItemRow {...BASE} actions={[STOCK, { ...ORDERED, done: true }, DELETE]} nextKey={null} />
      </OrderItemList>
    );
    expect(order()).toEqual(["Remove from stock", "Ordered", "Delete item"]);
  });

  it("shows a done step pressed and ticked, and taps it back to undo", async () => {
    wideScreen();
    const onUndo = vi.fn();
    renderRow({ actions: [{ ...ORDERED, done: true, onUndo }] });
    const done = screen.getByRole("button", { name: "Ordered" });
    expect(done).toHaveAttribute("aria-pressed", "true");
    expect(done).toHaveAttribute("title", "Undo ordered?");
    await userEvent.click(done);
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("a done step that can't be undone stays shown but can't be pressed", () => {
    wideScreen();
    renderRow({
      actions: [
        {
          key: "ready",
          label: "Ready to collect",
          group: "collect",
          onSelect: vi.fn(),
          done: true,
          doneLabel: "Cadet told",
        },
      ],
    });
    expect(screen.getByRole("button", { name: "Cadet told" })).toBeDisabled();
  });

  it("outlines each kind of step in its own colour, and tints the next one", () => {
    wideScreen();
    renderRow({ actions: [STOCK, ORDERED, { ...DELETE }], nextKey: "ordered" });
    expect(screen.getByRole("button", { name: "Remove from stock" })).toHaveClass(
      "border-chart-3/60",
      "dark:border-chart-3/80"
    );
    // Ordering steps share a colour; the next one is tinted, not moved.
    expect(screen.getByRole("button", { name: "Mark as ordered" })).toHaveClass(
      "border-chart-5",
      "bg-chart-5/15"
    );
    expect(screen.getByRole("button", { name: "Delete item" })).toHaveClass("text-destructive");
  });

  it("greys out a step that can't be done yet, and says why", () => {
    wideScreen();
    renderRow({ actions: [{ ...STOCK, disabled: true, hint: "None in stock" }] });
    const remove = screen.getByRole("button", { name: /Remove from stock/ });
    expect(remove).toBeDisabled();
    expect(remove).toHaveTextContent("None in stock");
  });

  it("keeps the compact menu on a phone", () => {
    vi.unstubAllGlobals();
    renderRow({ actions: [SIZE] });
    expect(screen.getByRole("button", { name: "More for Beret" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit size" })).toBeNull();
  });
});

describe("ItemCount", () => {
  const items = (given: number, of: number) =>
    Array.from({ length: of }, (_, i) => ({ givenAt: i < given ? "2026-11-16T19:00:00Z" : null }));

  it("counts the items before anything has been handed out", () => {
    render(<ItemCount items={items(0, 3)} completed={false} />);
    expect(screen.getByText("3 items")).toBeInTheDocument();
  });

  it("turns into the hand-out progress, then says when all are given", () => {
    const { rerender } = render(<ItemCount items={items(1, 3)} completed={false} />);
    expect(screen.getByText("1 of 3 given")).toBeInTheDocument();
    rerender(<ItemCount items={items(3, 3)} completed={false} />);
    expect(screen.getByText("All given")).toBeInTheDocument();
  });

  it("is just a count on a completed order", () => {
    render(<ItemCount items={items(3, 3)} completed />);
    expect(screen.getByText("3 items")).toBeInTheDocument();
  });

  it("says how many a search is showing", () => {
    render(<ItemCount items={items(1, 3)} shown={1} completed={false} />);
    expect(screen.getByText("1 of 3 items")).toBeInTheDocument();
  });

  it("is one badge, so an order's header stays on a phone's width", () => {
    const { container } = render(<ItemCount items={items(1, 1)} completed={false} />);
    expect(container.childElementCount).toBe(1);
  });
});
