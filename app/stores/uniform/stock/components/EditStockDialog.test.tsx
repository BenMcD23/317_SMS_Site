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

import { EditStockDialog } from "@/app/stores/uniform/stock/components/EditStockDialog";
import type { ShelfStructure, StockItem } from "@/lib/stores-types";

const shelf = {
  boxes: [{ label: "A", sections: [{ label: "1" }, { label: "2" }] }],
} as unknown as ShelfStructure;
const BERET = { id: "7", itemType: "Beret", size: "55", quantity: 3, box: "A", section: "1" } as StockItem;

function renderDialog(item: StockItem | null = BERET) {
  const onSuccess = vi.fn();
  render(
    <EditStockDialog open onOpenChange={vi.fn()} item={item} shelfStructure={shelf} onSuccess={onSuccess} />
  );
  return { onSuccess };
}

describe("EditStockDialog", () => {
  beforeEach(() => {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("opens filled in with the line being edited, every field labelled", () => {
    renderDialog();
    expect(screen.getByRole("combobox", { name: "Item Type" })).toHaveTextContent("Beret");
    expect(screen.getByLabelText("Size")).toHaveValue("55");
    expect(screen.getByLabelText("Quantity")).toHaveValue(3);
    expect(screen.getByRole("combobox", { name: "Box" })).toHaveTextContent("A");
    expect(screen.getByRole("combobox", { name: "Section" })).toHaveTextContent("1");
  });

  // A stock take that finds the box empty records zero rather than deleting.
  it("saves a line counted down to zero and hands back the saved row", async () => {
    const saved = { ...BERET, quantity: 0 };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(saved), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onSuccess } = renderDialog();

    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "0");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(saved));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/stores/stock/7");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      itemType: "Beret",
      size: "55",
      box: "A",
      section: "1",
      quantity: 0,
    });
  });

  it("won't save a negative count", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "-2");
    await user.tab();
    expect(await screen.findByText("Can't be negative")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
  });

  it("shows the API's reason when the save is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "Section 1 is full" }), { status: 409 }))
    );
    const user = userEvent.setup();
    const { onSuccess } = renderDialog();
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByText("Section 1 is full")).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("says the server couldn't be reached rather than failing silently", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
