// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/tests/render-with-query";

// One stable object, like the real hook — pages key effects on `session`.
const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import CataloguePage from "@/app/stores/catalogue/page";
import { canAccess } from "@/lib/access";
import type { CatalogueBadge, CatalogueItem } from "@/lib/catalogue";

function item(over: Partial<CatalogueItem> = {}): CatalogueItem {
  return {
    id: 1,
    name: "Beret",
    gender: "unisex",
    issuanceCategory: null,
    noSize: false,
    stockOnly: false,
    kitFlight: false,
    onOrderList: true,
    lowStockLevel: null,
    sizes: ["54", "56"],
    sizingFields: [],
    active: true,
    stockRows: 0,
    orderItems: 0,
    ...over,
  };
}

function badge(over: Partial<CatalogueBadge> = {}): CatalogueBadge {
  return {
    id: 10,
    slug: "music",
    name: "Music Badges",
    kind: "levels",
    prefix: "Music",
    levels: ["Blue", "Gold"],
    items: [],
    gainedWhere: true,
    active: true,
    inUse: 0,
    ...over,
  };
}

type Call = { method: string; path: string; body: unknown };

/** A fake API: GETs answer from `state`, writes are recorded (and may be made to fail). */
function fakeApi(
  state: { items: CatalogueItem[] | "error"; badges: CatalogueBadge[] },
  failWrites?: Response
) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = new URL(url, "http://api.test").pathname;
      const method = init.method ?? "GET";
      if (method === "GET") {
        if (path.endsWith("/catalogue/uniform")) {
          return state.items === "error"
            ? Response.json({ detail: "Database is down" }, { status: 503 })
            : Response.json(state.items);
        }
        if (path.endsWith("/catalogue/badges")) return Response.json(state.badges);
        return new Response("{}", { status: 404 });
      }
      calls.push({ method, path, body: init.body ? JSON.parse(String(init.body)) : undefined });
      return failWrites ? failWrites.clone() : Response.json({});
    })
  );
  return calls;
}

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
  // Radix Select relies on pointer-capture and scrolling APIs jsdom lacks.
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Catalogue page: who can open it", () => {
  it("is staff only, like the rest of Stores", () => {
    expect(canAccess("staff", "/stores/catalogue")).toBe(true);
    expect(canAccess("snco", "/stores/catalogue")).toBe(false);
    expect(canAccess("nco", "/stores/catalogue")).toBe(false);
    expect(canAccess(undefined, "/stores/catalogue")).toBe(false);
  });
});

describe("Catalogue page: loading what is there", () => {
  it("lists the items with what is unusual about each, and marks retired ones", async () => {
    fakeApi({
      items: [
        item(),
        item({ id: 2, name: "Fleece", lowStockLevel: 4, onOrderList: false }),
        item({ id: 3, name: "Cravat", noSize: true, sizes: [], active: false }),
      ],
      badges: [badge()],
    });
    renderWithQuery(<CataloguePage />);
    expect(await screen.findByRole("button", { name: "Edit Beret" })).toHaveTextContent("2 sizes");
    expect(screen.getByRole("button", { name: "Edit Fleece" })).toHaveTextContent(
      "orders below 4 · not on the order list"
    );
    expect(screen.getByRole("button", { name: "Edit Cravat" })).toHaveTextContent("Retired");
    // The tab counts only what the forms currently offer.
    expect(screen.getByRole("tab", { name: /Uniform\s*2/ })).toBeInTheDocument();
  });

  it("shows the API's message instead of a blank page when the load fails", async () => {
    fakeApi({ items: "error", badges: [] });
    renderWithQuery(<CataloguePage />);
    expect(await screen.findByText("Database is down")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load the catalogue")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit/ })).not.toBeInTheDocument();
  });

  it("offers to add the first item when there are none", async () => {
    fakeApi({ items: [], badges: [] });
    renderWithQuery(<CataloguePage />);
    expect(await screen.findByText("No items yet")).toBeInTheDocument();
  });

  it("shows badge categories on their own tab", async () => {
    fakeApi({ items: [item()], badges: [badge(), badge({ id: 11, name: "Old", active: false, inUse: 4 })] });
    const user = userEvent.setup();
    renderWithQuery(<CataloguePage />);
    await user.click(await screen.findByRole("tab", { name: /Badges/ }));
    expect(await screen.findByRole("button", { name: "Edit Music Badges" })).toHaveTextContent("2 levels");
    expect(screen.getByRole("button", { name: "Edit Old" })).toHaveTextContent("Retired");
    expect(screen.getByRole("button", { name: "Edit Old" })).toHaveTextContent("4 in use");
  });
});

describe("Catalogue page: adding an item", () => {
  it("saves the item with trimmed, de-duplicated sizes", async () => {
    const calls = fakeApi({ items: [item()], badges: [] });
    const user = userEvent.setup();
    renderWithQuery(<CataloguePage />);
    await screen.findByRole("button", { name: "Edit Beret" });

    await user.click(screen.getByRole("button", { name: "Add item" }));
    const dialog = await screen.findByRole("dialog", { name: "Add an item" });
    const save = within(dialog).getByRole("button", { name: "Add item" });
    // Nothing to save until it has a name and sizes.
    expect(save).toBeDisabled();

    await user.type(within(dialog).getByLabelText("Name"), "Fleece");
    await user.type(within(dialog).getByLabelText("Sizes"), "S{enter}M{enter} M {enter}L");
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({
      method: "POST",
      path: "/catalogue/uniform",
      body: { name: "Fleece", sizes: ["S", "M", "L"], noSize: false, lowStockLevel: null },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith("Item saved");
  });

  it("marks an item as held in stock only, and then hides the kit switch", async () => {
    const calls = fakeApi({ items: [item()], badges: [] });
    const user = userEvent.setup();
    renderWithQuery(<CataloguePage />);
    await user.click(await screen.findByRole("button", { name: "Add item" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("switch", { name: /part of a new cadet/i })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("switch", { name: "Held in stock only" }));
    expect(within(dialog).queryByRole("switch", { name: /part of a new cadet/i })).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Name"), "Polo");
    await user.type(within(dialog).getByLabelText("Sizes"), "S{enter}M");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Add item" })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ name: "Polo", stockOnly: true, kitFlight: false });
  });

  it("won't save a sized item without sizes, and says what to do", async () => {
    fakeApi({ items: [item()], badges: [] });
    const user = userEvent.setup();
    renderWithQuery(<CataloguePage />);
    await user.click(await screen.findByRole("button", { name: "Add item" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Fleece");
    await user.click(within(dialog).getByLabelText("Sizes"));
    await user.tab();
    expect(await within(dialog).findByText(/at least one size/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Add item" })).toBeDisabled();
  });

  it("hides the sizes for an item that has none", async () => {
    fakeApi({ items: [item()], badges: [] });
    const user = userEvent.setup();
    renderWithQuery(<CataloguePage />);
    await user.click(await screen.findByRole("button", { name: "Add item" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("switch", { name: "Has no size" }));
    expect(within(dialog).queryByLabelText("Sizes")).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Name"), "Lanyard");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Add item" })).toBeEnabled());
  });

  it("keeps the dialog open and shows the API's refusal when the name is taken", async () => {
    const calls = fakeApi(
      { items: [item()], badges: [] },
      Response.json({ detail: "There is already an item called Beret" }, { status: 409 })
    );
    const user = userEvent.setup();
    renderWithQuery(<CataloguePage />);
    await user.click(await screen.findByRole("button", { name: "Add item" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "beret");
    await user.type(within(dialog).getByLabelText("Sizes"), "54");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Add item" })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: "Add item" }));

    expect(await within(dialog).findByText("There is already an item called Beret")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(1);
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("Catalogue page: editing an item", () => {
  it("shows the name but doesn't let it change, and sends only what the form holds", async () => {
    const calls = fakeApi({ items: [item({ lowStockLevel: 4 })], badges: [] });
    const user = userEvent.setup();
    renderWithQuery(<CataloguePage />);
    await user.click(await screen.findByRole("button", { name: "Edit Beret" }));
    const dialog = await screen.findByRole("dialog", { name: "Beret" });
    expect(within(dialog).queryByLabelText("Name")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Order more below")).toHaveValue(4);

    await user.clear(within(dialog).getByLabelText("Order more below"));
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    const [call] = writes(calls);
    expect(call).toMatchObject({ method: "PATCH", path: "/catalogue/uniform/1" });
    // Emptied means "automatic" — sent as null, not left out, or the old level would stay.
    expect(call.body).toMatchObject({ lowStockLevel: null });
    expect(call.body).not.toHaveProperty("name");
  });

  it("starts each edit from the item, not from the last one cancelled", async () => {
    fakeApi({ items: [item(), item({ id: 2, name: "Jumper", sizes: ["74", "82"] })], badges: [] });
    const user = userEvent.setup();
    renderWithQuery(<CataloguePage />);
    await user.click(await screen.findByRole("button", { name: "Edit Beret" }));
    let dialog = await screen.findByRole("dialog", { name: "Beret" });
    await user.type(within(dialog).getByLabelText("Sizes"), "{enter}99");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Edit Jumper" }));
    dialog = await screen.findByRole("dialog", { name: "Jumper" });
    expect(within(dialog).getByLabelText("Sizes")).toHaveValue("74\n82");
  });

  it("retires an item without asking for confirmation, and says so", async () => {
    const calls = fakeApi({ items: [item({ stockRows: 3 })], badges: [] });
    const user = userEvent.setup();
    renderWithQuery(<CataloguePage />);
    await user.click(await screen.findByRole("button", { name: "Edit Beret" }));
    await user.click(await screen.findByRole("button", { name: "Retire item" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({
      method: "PATCH",
      path: "/catalogue/uniform/1",
      body: { active: false },
    });
    expect(toast.success).toHaveBeenCalledWith("Beret retired");
  });

  it("offers to restore a retired item", async () => {
    const calls = fakeApi({ items: [item({ active: false })], badges: [] });
    const user = userEvent.setup();
    renderWithQuery(<CataloguePage />);
    await user.click(await screen.findByRole("button", { name: "Edit Beret" }));
    await user.click(await screen.findByRole("button", { name: "Restore item" }));
    await waitFor(() => expect(writes(calls)[0]?.body).toEqual({ active: true }));
  });

  it("won't offer to delete an item that is in stock or on orders", async () => {
    fakeApi({ items: [item({ stockRows: 1, orderItems: 4 })], badges: [] });
    const user = userEvent.setup();
    renderWithQuery(<CataloguePage />);
    await user.click(await screen.findByRole("button", { name: "Edit Beret" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Delete item" })).not.toBeInTheDocument();
    expect(within(dialog).getByText(/retired but not deleted/)).toBeInTheDocument();
  });

  it("deletes an unused item only after confirming", async () => {
    const calls = fakeApi({ items: [item()], badges: [] });
    const user = userEvent.setup();
    renderWithQuery(<CataloguePage />);
    await user.click(await screen.findByRole("button", { name: "Edit Beret" }));
    await user.click(await screen.findByRole("button", { name: "Delete item" }));
    expect(writes(calls)).toHaveLength(0);
    await user.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "DELETE", path: "/catalogue/uniform/1" });
  });

  it("reports a refused write as a toast and reloads the list", async () => {
    fakeApi(
      { items: [item()], badges: [] },
      Response.json({ detail: "Beret is in stock or on orders: retire it instead" }, { status: 409 })
    );
    const user = userEvent.setup();
    renderWithQuery(<CataloguePage />);
    await user.click(await screen.findByRole("button", { name: "Edit Beret" }));
    await user.click(await screen.findByRole("button", { name: "Delete item" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Beret is in stock or on orders: retire it instead")
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("Catalogue page: order", () => {
  it("moves an item by sending the whole new order", async () => {
    const calls = fakeApi({
      items: [item({ id: 1 }), item({ id: 2, name: "Jumper" }), item({ id: 3, name: "Tie" })],
      badges: [],
    });
    const user = userEvent.setup();
    renderWithQuery(<CataloguePage />);
    await user.click(await screen.findByRole("button", { name: "Move Jumper up" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({
      method: "PUT",
      path: "/catalogue/uniform-order",
      body: { ids: [2, 1, 3] },
    });
  });

  it("can't move the first item up or the last one down", async () => {
    fakeApi({ items: [item({ id: 1 }), item({ id: 2, name: "Jumper" })], badges: [] });
    renderWithQuery(<CataloguePage />);
    expect(await screen.findByRole("button", { name: "Move Beret up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Jumper down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Beret down" })).toBeEnabled();
  });
});

describe("Catalogue page: badge categories", () => {
  async function openBadges(state: Parameters<typeof fakeApi>[0], failWrites?: Response) {
    const calls = fakeApi(state, failWrites);
    const user = userEvent.setup();
    renderWithQuery(<CataloguePage />);
    await user.click(await screen.findByRole("tab", { name: /Badges/ }));
    return { calls, user };
  }

  it("adds a category of levels, showing how orders will read", async () => {
    const { calls, user } = await openBadges({ items: [item()], badges: [badge()] });
    await user.click(screen.getByRole("button", { name: "Add category" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a badge category" });
    await user.type(within(dialog).getByLabelText("Name"), "Band Badges");
    await user.type(within(dialog).getByLabelText("Badge name starts with"), "Band");
    await user.type(within(dialog).getByLabelText("Levels"), "Blue{enter}Bronze");
    expect(within(dialog).getByText(/Band – Blue/)).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Add category" })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: "Add category" }));

    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({
      method: "POST",
      path: "/catalogue/badges",
      body: { name: "Band Badges", prefix: "Band", levels: ["Blue", "Bronze"], gainedWhere: true },
    });
  });

  it("shows the API's reason when a level that has been ordered is removed", async () => {
    const { user } = await openBadges(
      { items: [item()], badges: [badge({ inUse: 2 })] },
      Response.json(
        { detail: "Music – Gold has been ordered or is in stock: it can't be removed" },
        { status: 409 }
      )
    );
    await user.click(await screen.findByRole("button", { name: "Edit Music Badges" }));
    const dialog = await screen.findByRole("dialog", { name: "Music Badges" });
    // The kind and prefix are fixed once a category exists.
    expect(within(dialog).queryByLabelText("Badge name starts with")).not.toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("Levels"));
    await user.type(within(dialog).getByLabelText("Levels"), "Blue");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByText(/Music – Gold has been ordered/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("can retire a category that is in use but not delete it", async () => {
    const { calls, user } = await openBadges({ items: [item()], badges: [badge({ inUse: 5 })] });
    await user.click(await screen.findByRole("button", { name: "Edit Music Badges" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Delete category" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Retire category" }));
    await waitFor(() => expect(writes(calls)[0]?.body).toEqual({ active: false }));
  });

  it("empty state offers to add the first category", async () => {
    await openBadges({ items: [item()], badges: [] });
    expect(await screen.findByText("No badge categories yet")).toBeInTheDocument();
  });
});
