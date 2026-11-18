// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/reference", () => ({
  useReference: () => ({ sizes: { Shirt: ["90/35", "95/36"] } }),
}));

import { EditSizeDialog } from "@/app/stores/uniform/orders/components/edit-size-dialog";
import type { OrderItem } from "@/lib/stores-types";

function item(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "i1",
    itemType: "Shirt",
    size: "90/35",
    needSizing: false,
    sizingDetails: "",
    qmNotes: [],
    givenAt: null,
    givenBy: null,
    readyToCollect: null,
    ...overrides,
  } as OrderItem;
}

function renderDialog(target: OrderItem | null, onSave = vi.fn().mockResolvedValue(true)) {
  const onClose = vi.fn();
  render(<EditSizeDialog key={target?.id ?? "closed"} item={target} onClose={onClose} onSave={onSave} />);
  return { onSave, onClose };
}

describe("EditSizeDialog", () => {
  it("is closed when there's no item", () => {
    renderDialog(null);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("starts from the item's size and saves a new one", async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = renderDialog(item());
    const box = screen.getByLabelText("Size");
    expect(box).toHaveValue("90/35");

    await user.click(box);
    await user.click(screen.getByRole("button", { name: "95/36" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({ size: "95/36", needSizing: false, sizingDetails: "" });
    expect(onClose).toHaveBeenCalled();
  });

  it("marking an item as needing sizing clears its size and saves the measurements", async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog(item());

    await user.click(screen.getByRole("checkbox", { name: "Needs Sizing" }));
    await user.type(screen.getByLabelText("Sizing Details"), "chest 96cm");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({ size: "", needSizing: true, sizingDetails: "chest 96cm" });
  });

  it("unticking needs-sizing throws the measurements away", async () => {
    // Otherwise a sized item would carry stale "needs sizing" notes forever.
    const user = userEvent.setup();
    const { onSave } = renderDialog(item({ size: "", needSizing: true, sizingDetails: "chest 96cm" }));

    await user.click(screen.getByRole("checkbox", { name: "Needs Sizing" }));
    await user.click(screen.getByLabelText("Size"));
    await user.click(screen.getByRole("button", { name: "90/35" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({ size: "90/35", needSizing: false, sizingDetails: "" });
  });

  it("can't save an item with neither a size nor needs-sizing, by button or by Enter", async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = renderDialog(item({ size: "" }));

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.type(screen.getByLabelText("Size"), "{Enter}");

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("stays open when the save fails, so the edit isn't lost", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(false);
    const { onClose } = renderDialog(item(), onSave);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Cancel closes without saving", async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = renderDialog(item());

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
