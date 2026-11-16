// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LogsFormTab } from "@/app/stores/uniform/orders/components/logs-form-tab";
import type { LogsForm } from "@/lib/stores-types";

const OPEN: LogsForm = {
  id: "f1",
  createdAt: "2026-11-01T18:00:00Z",
  orderedAt: null,
  entries: [
    { id: "e1", orderItemId: "i1", itemType: "Jumper", size: "96", cadetName: "Amy Able" },
    { id: "e2", orderItemId: "i2", itemType: "Tie", size: "", cadetName: "Zoë Ångström" },
  ],
};
const PAST: LogsForm = { ...OPEN, id: "f0", orderedAt: "2026-10-01T18:00:00Z" };

describe("Logs Form tab", () => {
  it("lists what's on the current form, with its download", () => {
    render(<LogsFormTab openForm={OPEN} pastForms={[]} onRemoveEntry={vi.fn()} onMarkOrdered={vi.fn()} />);
    expect(screen.getByText("Zoë Ångström")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download Logs Form" })).toHaveAttribute(
      "href",
      "/api/stores/logs-forms/f1/download"
    );
  });

  it("removes an item and marks the form ordered through the page", async () => {
    const user = userEvent.setup();
    const onRemoveEntry = vi.fn();
    const onMarkOrdered = vi.fn();
    render(
      <LogsFormTab
        openForm={OPEN}
        pastForms={[]}
        onRemoveEntry={onRemoveEntry}
        onMarkOrdered={onMarkOrdered}
      />
    );
    await user.click(screen.getAllByRole("button", { name: "Remove from logs form" })[0]);
    expect(onRemoveEntry).toHaveBeenCalledWith("e1");
    await user.click(screen.getByRole("button", { name: "Mark as Ordered" }));
    expect(onMarkOrdered).toHaveBeenCalledWith("f1");
  });

  it("says how to start a form when there isn't one, and offers nothing to order", () => {
    render(<LogsFormTab openForm={null} pastForms={[]} onRemoveEntry={vi.fn()} onMarkOrdered={vi.fn()} />);
    expect(screen.getByText("Nothing added yet")).toBeInTheDocument();
    expect(screen.getByText(/Use "Add to Logs Form" on an order item/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as Ordered" })).toBeNull();
  });

  it("folds past forms away until one is opened", async () => {
    const user = userEvent.setup();
    render(
      <LogsFormTab openForm={null} pastForms={[PAST]} onRemoveEntry={vi.fn()} onMarkOrdered={vi.fn()} />
    );
    expect(screen.queryByText("Amy Able")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("Amy Able")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.queryByText("Amy Able")).toBeNull();
  });
});
