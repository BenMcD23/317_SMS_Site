// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
vi.mock("@/lib/reference", () => ({
  useReference: () => ({ issuanceCategories: ["Beret", "Tie", "Belt"] }),
}));

import { UniformIssuancesCard } from "@/components/uniform-issuances-card";
import { renderWithQuery } from "@/tests/render-with-query";

let posted: unknown[];
let undone: string[];
let failWrites = false;
let historyLoads = 0;
let restored: unknown = null;
let history: unknown[] = [];

const entry = (over: Record<string, unknown>) => ({
  id: 1,
  itemCategory: "Beret",
  lastGiven: "2025-09-03T00:00:00",
  sizeGiven: "56",
  recordedAt: "2025-09-03T19:00:00",
  recordedBy: "QM Smith",
  orderItemId: null,
  undoneAt: null,
  undoneBy: null,
  current: false,
  ...over,
});

beforeEach(() => {
  posted = [];
  undone = [];
  failWrites = false;
  historyLoads = 0;
  restored = null;
  history = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.endsWith("/undo")) {
        undone.push(url);
        if (failWrites)
          return new Response(JSON.stringify({ detail: "Reopen the order before undoing an item" }), {
            status: 409,
          });
        return new Response(JSON.stringify({ issuance: restored, undone: { id: 2 } }));
      }
      if (url.endsWith("/history")) {
        historyLoads++;
        return new Response(JSON.stringify(history));
      }
      if (init.method === "POST") {
        if (failWrites) return new Response("{}", { status: 500 });
        const body = JSON.parse(init.body as string);
        posted.push(body);
        const item = body.items[0];
        return new Response(
          JSON.stringify([
            {
              id: 9,
              itemCategory: item.itemCategory,
              lastGiven: `${item.lastGiven}T00:00:00`,
              sizeGiven: item.sizeGiven,
            },
          ])
        );
      }
      return new Response(
        JSON.stringify([{ id: 1, itemCategory: "Beret", lastGiven: "2025-09-03T00:00:00", sizeGiven: "56" }])
      );
    })
  );
});

describe("UniformIssuancesCard", () => {
  it("lists every catalogue category with what was last issued", async () => {
    renderWithQuery(<UniformIssuancesCard baseUrl="/api/stores/issuances/1" />);
    expect(await screen.findByText("3 Sept 2025")).toBeInTheDocument();
    expect(screen.getByText("Size: 56")).toBeInTheDocument();
    expect(screen.getAllByText("N/A")).toHaveLength(2);
  });

  it("records an issue and shows it", async () => {
    const user = userEvent.setup();
    renderWithQuery(<UniformIssuancesCard baseUrl="/api/stores/issuances/1" />);
    await user.click(await screen.findByRole("button", { name: "Edit Tie" }));
    await user.type(screen.getByPlaceholderText("Size (optional)"), "Short");
    await user.click(screen.getByRole("button", { name: "Save Tie" }));
    await waitFor(() => expect(screen.getByText("Size: Short")).toBeInTheDocument());
    expect(posted[0]).toEqual({
      items: [
        { itemCategory: "Tie", sizeGiven: "Short", lastGiven: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
      ],
    });
  });

  it("a blank size is sent as null", async () => {
    const user = userEvent.setup();
    renderWithQuery(<UniformIssuancesCard baseUrl="/api/stores/issuances/1" />);
    await user.click(await screen.findByRole("button", { name: "Edit Belt" }));
    await user.click(screen.getByRole("button", { name: "Save Belt" }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect((posted[0] as { items: { sizeGiven: unknown }[] }).items[0].sizeGiven).toBeNull();
  });

  it("undoing the last give asks first, then shows the record it goes back to", async () => {
    restored = { id: 1, itemCategory: "Beret", lastGiven: "2024-02-01T00:00:00", sizeGiven: "55" };
    const user = userEvent.setup();
    renderWithQuery(<UniformIssuancesCard baseUrl="/api/stores/issuances/1" />);
    await user.click(await screen.findByRole("button", { name: "Edit Beret" }));
    await user.click(screen.getByRole("button", { name: "Undo last given" }));
    expect(screen.getByText(/Undo the last Beret given \(size 56, 3 Sept 2025\)/)).toBeInTheDocument();
    expect(undone).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("1 Feb 2024")).toBeInTheDocument();
    expect(screen.getByText("Size: 55")).toBeInTheDocument();
    expect(undone).toEqual(["/api/stores/issuances/item/1/undo"]);
  });

  it("undoing the only give leaves the category empty", async () => {
    const user = userEvent.setup();
    renderWithQuery(<UniformIssuancesCard baseUrl="/api/stores/issuances/1" />);
    await user.click(await screen.findByRole("button", { name: "Edit Beret" }));
    await user.click(screen.getByRole("button", { name: "Undo last given" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getAllByText("N/A")).toHaveLength(3));
  });

  it("a refused undo shows the API's reason and keeps the record", async () => {
    failWrites = true;
    const user = userEvent.setup();
    renderWithQuery(<UniformIssuancesCard baseUrl="/api/stores/issuances/1" />);
    await user.click(await screen.findByRole("button", { name: "Edit Beret" }));
    await user.click(screen.getByRole("button", { name: "Undo last given" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Reopen the order before undoing an item")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("3 Sept 2025")).toBeInTheDocument();
  });

  it("history loads only when opened and shows undone gives as well", async () => {
    history = [
      entry({
        id: 3,
        sizeGiven: "57",
        undoneAt: "2025-09-10T19:00:00",
        undoneBy: "QM Jones",
        recordedAt: "2025-09-10T18:00:00",
      }),
      entry({ id: 2, current: true, orderItemId: "12" }),
      entry({ id: 1, itemCategory: "Tie", sizeGiven: null, recordedBy: null }),
    ];
    const user = userEvent.setup();
    renderWithQuery(<UniformIssuancesCard baseUrl="/api/stores/issuances/1" />);
    await screen.findByText("3 Sept 2025");
    expect(historyLoads).toBe(0);
    await user.click(screen.getByRole("button", { name: "History" }));
    const list = await screen.findByRole("list", { name: "Issuance history" });
    expect(historyLoads).toBe(1);
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("undone by QM Jones 10 Sept 2025");
    expect(rows[1]).toHaveTextContent("By QM Smith · from an order");
    expect(rows[2]).toHaveTextContent("Recorded before history was kept");
    // Only the give the record is showing can be undone.
    expect(within(list).getAllByRole("button", { name: /Undo last/ })).toHaveLength(1);
    await user.click(within(list).getByRole("button", { name: "Undo last Beret given" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(undone).toEqual(["/api/stores/issuances/item/1/undo"]));
    // The history refetches to show the give as undone.
    await waitFor(() => expect(historyLoads).toBe(2));
  });

  it("an empty history says so", async () => {
    const user = userEvent.setup();
    renderWithQuery(<UniformIssuancesCard baseUrl="/api/stores/issuances/1" />);
    await user.click(await screen.findByRole("button", { name: "History" }));
    expect(await screen.findByText("Nothing recorded as given yet.")).toBeInTheDocument();
  });

  it("a failed history load says so", async () => {
    const user = userEvent.setup();
    renderWithQuery(<UniformIssuancesCard baseUrl="/api/stores/issuances/1" />);
    await screen.findByText("3 Sept 2025");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "History unavailable" }), { status: 500 }))
    );
    await user.click(screen.getByRole("button", { name: "History" }));
    expect(await screen.findByText("History unavailable")).toBeInTheDocument();
  });

  it("shows an error and keeps the editor open when saving fails", async () => {
    failWrites = true;
    const user = userEvent.setup();
    renderWithQuery(<UniformIssuancesCard baseUrl="/api/stores/issuances/1" />);
    await user.click(await screen.findByRole("button", { name: "Edit Tie" }));
    await user.click(screen.getByRole("button", { name: "Save Tie" }));
    expect(await screen.findByText("Failed to save")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Tie" })).toBeInTheDocument();
  });

  it("a failed load shows the categories with nothing issued", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 }))
    );
    renderWithQuery(<UniformIssuancesCard baseUrl="/api/stores/issuances/1" />);
    await waitFor(() => expect(screen.getAllByText("N/A")).toHaveLength(3));
  });

  it("a failed lookup says so, rather than showing nothing issued", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "Cadet record unavailable" }), { status: 500 }))
    );
    renderWithQuery(<UniformIssuancesCard baseUrl="/api/stores/issuances/1" />);
    expect(await screen.findByText("Cadet record unavailable")).toBeInTheDocument();
  });
});
