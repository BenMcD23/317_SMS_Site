// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
vi.mock("@/lib/reference", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reference")>()),
  useReference: () => ({ gainedWhereOptions: [], badgeCategories: [] }),
}));

import { NewBadgeOrderDialog } from "@/app/stores/badges/orders/components/new-order-dialog";
import { renderWithQuery } from "@/tests/render-with-query";

const AMY = { cin: 1, first_name: "Amy", last_name: "Able", rank: "Cpl", flight: "A" };

beforeEach(() => {
  // cmdk and Radix measure and scroll; jsdom does neither.
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

/** The page's side: a button that opens the dialog. */
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>New Order</button>
      <NewBadgeOrderDialog
        open={open}
        onOpenChange={setOpen}
        token="tok"
        onCreated={vi.fn()}
        onError={vi.fn()}
      />
    </>
  );
}

async function pickCadet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox", { name: "Search cadet" }));
  await user.type(screen.getByPlaceholderText("Type a name…"), "amy");
  await user.click(await screen.findByText("Cpl Amy Able"));
}

describe("New Badge Order dialog", () => {
  it("won't create an order without a cadet and at least one badge", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await user.click(screen.getByRole("button", { name: "New Order" }));
    expect(screen.getByRole("button", { name: "Create Order" })).toBeDisabled();
    await pickCadet(user);
    // A cadet alone isn't an order.
    expect(screen.getByRole("button", { name: "Create Order" })).toBeDisabled();
  });

  it("starts empty every time it opens, not with the last cadet picked", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await user.click(screen.getByRole("button", { name: "New Order" }));
    await pickCadet(user);
    expect(screen.getByRole("combobox", { name: "Cadet: Amy Able" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => {});
    await user.click(screen.getByRole("button", { name: "New Order" }));
    expect(await screen.findByRole("combobox", { name: "Search cadet" })).toBeInTheDocument();
  });
});
