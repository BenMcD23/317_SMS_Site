// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BadgeHistoryPage from "@/app/stores/badges/history/page";
import { canAccess } from "@/lib/access";
import type { BadgeHistoryRow } from "@/lib/badges-given";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function row(over: Partial<BadgeHistoryRow>): BadgeHistoryRow {
  return {
    id: "1-a",
    orderId: "1",
    itemId: "1",
    badgeName: "Leadership – Blue",
    cadetName: "Zoë Ó Briain",
    cadetCin: 1001,
    action: "given",
    timestamp: "2026-11-01T19:30:00",
    by: "QM Smith",
    current: true,
    ...over,
  };
}

let responses: Record<string, () => Response>;

beforeEach(() => {
  responses = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const match = Object.keys(responses).find((k) => url.includes(k));
      return match ? responses[match]() : new Response("[]");
    })
  );
});

const answer =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status });

describe("Badge history page", () => {
  it("lists gives and undos, linking each cadet to their record", async () => {
    responses["/stores/badges/history"] = answer([
      row({ id: "1-c" }),
      row({ id: "1-b", action: "undone", current: false, by: "QM Jones" }),
      row({ id: "1-a", current: false }),
    ]);
    renderWithQuery(<BadgeHistoryPage />);
    const table = await screen.findByRole("table", { name: "Badges given out" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[3].textContent)).toEqual([
      "GivenBy QM Smith",
      "UndoneBy QM Jones",
      "Given, since undoneBy QM Smith",
    ]);
    expect(within(rows[0]).getByRole("link", { name: "Zoë Ó Briain" })).toHaveAttribute(
      "href",
      "/cadets/1001"
    );
  });

  it("the stock changes tab shows the badge grid's log", async () => {
    responses["/stores/badges/history"] = answer([]);
    responses["/stores/stock/changes?kind=badge"] = answer([
      {
        id: 1,
        kind: "badge",
        stockItemId: 2,
        itemName: "Radio – Bronze",
        size: null,
        location: "Top shelf",
        action: "added",
        change: 4,
        quantityAfter: 4,
        note: null,
        orderId: null,
        changedAt: "2026-11-01T19:00:00",
        changedBy: "Sam Staff",
      },
    ]);
    const user = userEvent.setup();
    renderWithQuery(<BadgeHistoryPage />);
    await user.click(screen.getByRole("tab", { name: "Stock changes" }));
    const table = await screen.findByRole("table", { name: "Stock changes" });
    expect(table).toHaveTextContent("Radio – Bronze");
    expect(table).toHaveTextContent("Top shelf");
  });

  it("says when no badges have been given", async () => {
    responses["/stores/badges/history"] = answer([]);
    renderWithQuery(<BadgeHistoryPage />);
    expect(await screen.findByText("No badges given out yet")).toBeInTheDocument();
  });

  it("a failed load shows the API's reason", async () => {
    responses["/stores/badges/history"] = answer({ detail: "Database unavailable" }, 500);
    renderWithQuery(<BadgeHistoryPage />);
    expect(await screen.findByText("Database unavailable")).toBeInTheDocument();
  });

  it("is staff only", () => {
    expect(canAccess("staff", "/stores/badges/history")).toBe(true);
    for (const role of ["snco", "nco", undefined])
      expect(canAccess(role, "/stores/badges/history")).toBe(false);
  });
});
