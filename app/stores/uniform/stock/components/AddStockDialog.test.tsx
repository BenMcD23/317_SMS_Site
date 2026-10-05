// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/reference", () => ({
  useReference: () => ({
    itemTypes: ["Beret", "Lanyard"],
    noSizeItems: new Set(["Lanyard"]),
    sizes: { Beret: ["54", "55", "56"] },
  }),
}));

import { AddStockDialog } from "@/app/stores/uniform/stock/components/AddStockDialog";
import type { ShelfStructure, StockItem } from "@/lib/stores-types";

const shelf = {
  boxes: [{ label: "A", sections: [{ label: "1" }, { label: "2" }] }],
} as unknown as ShelfStructure;

function renderDialog(stock: StockItem[] = []) {
  const onSuccess = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <AddStockDialog
      open
      onOpenChange={onOpenChange}
      stock={stock}
      shelfStructure={shelf}
      onSuccess={onSuccess}
    />
  );
  return { onSuccess, onOpenChange };
}

async function pick(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("AddStockDialog", () => {
  beforeEach(() => {
    // Radix Select relies on pointer-capture and scrolling APIs jsdom lacks.
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("a stock count can record a size the catalogue doesn't list", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onSuccess } = renderDialog();

    await pick(user, "Item Type", "Beret");
    await user.type(screen.getByLabelText("Size"), "  57 (old pattern) ");
    await pick(user, "Box", "A");
    await pick(user, "Section", "2");
    await user.click(screen.getByRole("button", { name: "Add Stock" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/stores/stock", expect.objectContaining({ method: "POST" }));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    // Surrounding whitespace is trimmed so it can't create a near-duplicate row.
    expect(JSON.parse(init.body as string)).toEqual({
      itemType: "Beret",
      size: "57 (old pattern)",
      box: "A",
      section: "2",
      quantity: 1,
    });
  });

  it("catalogue sizes are still suggested and fill in the existing stock location", async () => {
    const user = userEvent.setup();
    renderDialog([
      { id: "1", itemType: "Beret", size: "55", quantity: 2, box: "A", section: "2" } as unknown as StockItem,
    ]);

    await pick(user, "Item Type", "Beret");
    await user.click(screen.getByLabelText("Size"));
    expect(screen.getAllByRole("button", { name: /^5\d$/ }).map((b) => b.textContent)).toEqual([
      "54",
      "55",
      "56",
    ]);
    await user.click(screen.getByRole("button", { name: "55" }));

    expect(screen.getByLabelText("Size")).toHaveValue("55");
    expect(screen.getByText(/existing stock for this item and size/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Box" })).toHaveTextContent("A");
    expect(screen.getByRole("combobox", { name: "Section" })).toHaveTextContent("2");
  });

  it("a blank or whitespace-only size can't be submitted", async () => {
    const user = userEvent.setup();
    renderDialog();

    await pick(user, "Item Type", "Beret");
    await pick(user, "Box", "A");
    await pick(user, "Section", "1");
    expect(screen.getByRole("button", { name: "Add Stock" })).toBeDisabled();

    await user.type(screen.getByLabelText("Size"), "   ");
    expect(screen.getByRole("button", { name: "Add Stock" })).toBeDisabled();
  });

  it("items without sizes skip the size field and send N/A", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDialog();

    await pick(user, "Item Type", "Lanyard");
    expect(screen.queryByLabelText("Size")).toBeNull();
    await pick(user, "Box", "A");
    await pick(user, "Section", "1");
    await user.click(screen.getByRole("button", { name: "Add Stock" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ itemType: "Lanyard", size: "N/A" });
  });

  it("a failed save shows an error and keeps the dialog open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "Box not found" }), { status: 404 }))
    );
    const user = userEvent.setup();
    const { onSuccess, onOpenChange } = renderDialog();

    await pick(user, "Item Type", "Beret");
    await user.type(screen.getByLabelText("Size"), "XXL");
    await pick(user, "Box", "A");
    await pick(user, "Section", "1");
    await user.click(screen.getByRole("button", { name: "Add Stock" }));

    expect(await screen.findByText("Failed to add stock")).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add Stock" })).toBeEnabled();
  });
});
