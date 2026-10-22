// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GivenStamp } from "@/components/given-stamp";
import type { GivenEvent } from "@/lib/stores-types";

const given = (id: string, by = "QM Smith"): GivenEvent => ({
  id,
  action: "given",
  timestamp: "2026-10-01T18:00:00",
  by,
});
const undone = (id: string, by = "QM Jones"): GivenEvent => ({
  id,
  action: "undone",
  timestamp: "2026-10-02T09:30:00",
  by,
});

function renderStamp(props: Partial<React.ComponentProps<typeof GivenStamp>> = {}) {
  return render(<GivenStamp givenAt="2026-10-01T18:00:00" givenBy="QM Smith" itemLabel="Beret" {...props} />);
}

describe("GivenStamp", () => {
  it("shows who gave the item and when", () => {
    renderStamp();
    expect(screen.getByText(/Given 01 Oct 2026, 18:00/)).toHaveTextContent("QM Smith");
  });

  it("offers Undo only when the order allows it, named for the item", async () => {
    const onUndo = vi.fn();
    const { rerender } = renderStamp({ onUndo });
    await userEvent.click(screen.getByRole("button", { name: "Undo given: Beret" }));
    expect(onUndo).toHaveBeenCalledTimes(1);

    // A completed order passes no handler, so no button.
    rerender(<GivenStamp givenAt="2026-10-01T18:00:00" givenBy="QM Smith" itemLabel="Beret" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("disables Undo while it's being saved so a double click can't undo twice", () => {
    renderStamp({ onUndo: vi.fn(), undoing: true });
    expect(screen.getByRole("button", { name: "Undo given: Beret" })).toBeDisabled();
  });

  // Until something is undone the history would just repeat the stamp.
  it("shows no history for an item that was simply given", () => {
    renderStamp({ events: [given("a")] });
    expect(screen.queryByRole("list", { name: "Given history" })).toBeNull();
  });

  it("keeps the whole history after an undo and a second give", () => {
    renderStamp({ givenBy: "QM Lee", events: [given("a"), undone("b"), given("c", "QM Lee")] });
    const items = within(screen.getByRole("list", { name: "Given history" })).getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Given 01 Oct 2026, 18:00 · QM Smith",
      "Undone 02 Oct 2026, 09:30 · QM Jones",
      "Given 01 Oct 2026, 18:00 · QM Lee",
    ]);
  });

  // After the undo there is no current give, but the trail must still be there.
  it("shows the history without a stamp once the item has been taken back", () => {
    renderStamp({ givenAt: null, givenBy: null, events: [given("a"), undone("b")] });
    // Only the history's own "Given" line: no current-state stamp, no Undo.
    expect(screen.getAllByText(/^Given 01 Oct/)).toHaveLength(1);
    expect(screen.queryByRole("button")).toBeNull();
    expect(within(screen.getByRole("list", { name: "Given history" })).getAllByRole("listitem")).toHaveLength(
      2
    );
  });

  it("renders nothing for an item that was never given", () => {
    const { container } = renderStamp({ givenAt: null, givenBy: null, events: [] });
    expect(container).toBeEmptyDOMElement();
  });
});
