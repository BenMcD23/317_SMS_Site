// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StockChangesTable } from "@/components/stock-changes-table";
import type { StockChange } from "@/lib/stock-changes";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = { data: { id_token: "tok" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

function change(over: Partial<StockChange>): StockChange {
  return {
    id: 1,
    kind: "uniform",
    stockItemId: 4,
    itemName: "Beret",
    size: "55",
    location: "A / 1",
    action: "added",
    change: 3,
    quantityAfter: 3,
    note: null,
    orderId: null,
    changedAt: "2026-11-01T19:30:00",
    changedBy: "Sam Staff",
    ...over,
  };
}

let response: () => Response;
let requested: string[];

beforeEach(() => {
  requested = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requested.push(url);
      return response();
    })
  );
});

const answer =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status });

describe("StockChangesTable", () => {
  it("shows each change with what it left, asking only for its own side of the stores", async () => {
    response = answer([
      change({ id: 3, action: "deleted", change: -2, quantityAfter: null, changedAt: "2026-11-03T19:00:00" }),
      change({ id: 2, action: "taken", change: -1, quantityAfter: 2, note: "For Zoë Ó Briain", orderId: 9 }),
      change({ id: 1, action: "moved", change: 0, note: "From B / 2", changedAt: "2026-10-01T19:00:00" }),
    ]);
    renderWithQuery(<StockChangesTable kind="badge" />);
    const table = await screen.findByRole("table", { name: "Stock changes" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Deleted");
    expect(rows[0]).toHaveTextContent("−2");
    expect(rows[0]).toHaveTextContent("Gone");
    expect(rows[1]).toHaveTextContent("Taken for an order");
    expect(rows[1]).toHaveTextContent("For Zoë Ó Briain");
    expect(rows[1]).toHaveTextContent("Now 2");
    expect(rows[2]).toHaveTextContent("Moved");
    expect(rows[2]).toHaveTextContent("From B / 2");
    expect(requested[0]).toContain("/stores/stock/changes?kind=badge");
  });

  it("says when nothing has changed yet", async () => {
    response = answer([]);
    renderWithQuery(<StockChangesTable kind="uniform" />);
    expect(await screen.findByText("No stock changes yet")).toBeInTheDocument();
  });

  it("a failed load shows the API's reason, not an empty log", async () => {
    response = answer({ detail: "Database unavailable" }, 500);
    renderWithQuery(<StockChangesTable kind="uniform" />);
    expect(await screen.findByText("Database unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No stock changes yet")).toBeNull();
  });

  it("an error body where a list was expected doesn't crash", async () => {
    response = answer({ detail: "odd" });
    renderWithQuery(<StockChangesTable kind="uniform" />);
    expect(await screen.findByText("No stock changes yet")).toBeInTheDocument();
  });
});
