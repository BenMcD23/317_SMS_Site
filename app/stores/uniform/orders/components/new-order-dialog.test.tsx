// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
vi.mock("@/lib/reference", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reference")>()),
  useReference: () => ({ itemTypes: ["Jumper", "Tie"], noSizeItems: new Set(["Tie"]), sizes: {} }),
}));

import { NewUniformOrderDialog } from "@/app/stores/uniform/orders/components/new-order-dialog";
import { renderWithQuery } from "@/tests/render-with-query";

const AMY = { cin: 7, first_name: "Amy", last_name: "Able", rank: "Cdt", flight: "C" };

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify([AMY])))
  );
});

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>New Order</button>
      <NewUniformOrderDialog
        open={open}
        onOpenChange={setOpen}
        token="tok"
        onCreated={vi.fn()}
        onError={vi.fn()}
      />
    </>
  );
}

describe("New uniform order dialog", () => {
  it("won't create an order until a cadet and an item are chosen", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await user.click(screen.getByRole("button", { name: "New Order" }));
    expect(screen.getByRole("button", { name: "Create Order" })).toBeDisabled();
    await user.click(screen.getByRole("combobox", { name: "Search cadet" }));
    await user.type(screen.getByPlaceholderText("Type a name…"), "amy");
    await user.click(await screen.findByText("Cdt Amy Able"));
    // One empty item line isn't an item.
    expect(screen.getByRole("button", { name: "Create Order" })).toBeDisabled();
  });

  it("starts with one empty line every time it opens, not the last order's", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await user.click(screen.getByRole("button", { name: "New Order" }));
    await user.click(screen.getByRole("button", { name: "Add Item" }));
    expect(screen.getAllByRole("button", { name: "Remove item" })).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => {});
    await user.click(screen.getByRole("button", { name: "New Order" }));
    expect(await screen.findAllByRole("button", { name: "Remove item" })).toHaveLength(1);
  });
});
