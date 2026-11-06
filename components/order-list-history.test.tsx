// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrderListHistory } from "@/components/order-list-history";
import type { OrderListEvent } from "@/lib/stores-types";

const ev = (
  id: string,
  action: OrderListEvent["action"],
  by: string | null = "QM Smith"
): OrderListEvent => ({
  id,
  action,
  timestamp: "2026-11-06T14:00:00",
  by,
});

describe("OrderListHistory", () => {
  // Until something is undone the stamps already say it all.
  it("shows nothing while every step still stands", () => {
    const { container } = render(<OrderListHistory events={[ev("a", "added"), ev("b", "ordered")]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing for an entry from an API without the log", () => {
    const { container } = render(<OrderListHistory />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists every step and undo once one has been undone", () => {
    render(
      <OrderListHistory
        events={[ev("a", "added"), ev("b", "ordered"), ev("c", "received"), ev("d", "received_undone", null)]}
      />
    );
    const items = within(screen.getByRole("list", { name: "Order list history" })).getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Added to order list 06 Nov 2026, 14:00 · QM Smith",
      "Marked ordered 06 Nov 2026, 14:00 · QM Smith",
      "Marked received 06 Nov 2026, 14:00 · QM Smith",
      "Received undone 06 Nov 2026, 14:00",
    ]);
  });
});
