// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import UniformHistoryPage from "@/app/stores/uniform/history/page";
import { canAccess } from "@/lib/access";
import type { RecentIssuance } from "@/lib/issuance-history";
import { renderWithQuery } from "@/tests/render-with-query";

// One stable object, like the real hook — pages key effects on `session`.
const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function row(over: Partial<RecentIssuance>): RecentIssuance {
  return {
    id: 1,
    itemCategory: "Beret",
    lastGiven: "2026-10-29T00:00:00",
    sizeGiven: "56",
    recordedAt: "2026-10-29T19:30:00",
    recordedBy: "QM Smith",
    orderItemId: null,
    undoneAt: null,
    undoneBy: null,
    current: true,
    subjectName: "Zoë Ó Briain",
    subjectType: "cadet",
    cadetCin: 1001,
    userId: null,
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
  (rows: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(rows), { status });

describe("Uniform history page", () => {
  it("lists recent gives with where each stands, linking cadets to their uniform tab", async () => {
    response = answer([
      row({
        id: 3,
        sizeGiven: "XL",
        itemCategory: "Jumper",
        current: false,
        undoneAt: "2026-11-01T10:00:00",
        undoneBy: "QM Jones",
      }),
      row({
        id: 2,
        subjectName: "Rhian Morgan",
        subjectType: "user",
        cadetCin: null,
        userId: 4,
        itemCategory: "Tie",
        sizeGiven: null,
        orderItemId: "7",
      }),
      row({ id: 1, current: false, recordedAt: "2026-10-01T19:30:00" }),
    ]);
    renderWithQuery(<UniformHistoryPage />);
    const table = await screen.findByRole("table", { name: "Uniform history" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Jumper · XL");
    expect(rows[0]).toHaveTextContent("Undone");
    expect(rows[0]).toHaveTextContent("QM Jones, 1 Nov 2026");
    expect(rows[1]).toHaveTextContent("On record");
    expect(rows[1]).toHaveTextContent("From an order");
    expect(rows[2]).toHaveTextContent("Replaced");
    // Cadets open their record; adults have none to open.
    expect(within(rows[0]).getByRole("link", { name: "Zoë Ó Briain" })).toHaveAttribute(
      "href",
      "/cadets/1001?tab=uniform"
    );
    expect(within(rows[1]).queryByRole("link")).toBeNull();
    expect(requested[0]).toContain("/stores/issuances/recent");
  });

  it("says when nothing has been given out", async () => {
    response = answer([]);
    renderWithQuery(<UniformHistoryPage />);
    expect(await screen.findByText("Nothing given out yet")).toBeInTheDocument();
  });

  it("a failed load shows the API's reason, not an empty history", async () => {
    response = answer({ detail: "Database unavailable" }, 500);
    renderWithQuery(<UniformHistoryPage />);
    expect(await screen.findByText("Database unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Nothing given out yet")).toBeNull();
  });

  it("an error body where a list was expected doesn't crash the page", async () => {
    response = answer({ detail: "odd" });
    renderWithQuery(<UniformHistoryPage />);
    expect(await screen.findByText("Nothing given out yet")).toBeInTheDocument();
  });

  it("the stock changes tab asks for the uniform log only", async () => {
    response = answer([]);
    const user = userEvent.setup();
    renderWithQuery(<UniformHistoryPage />);
    await user.click(screen.getByRole("tab", { name: "Stock changes" }));
    expect(await screen.findByText("No stock changes yet")).toBeInTheDocument();
    expect(requested.some((u) => u.includes("/stores/stock/changes?kind=uniform"))).toBe(true);
  });

  it("is staff only, like the rest of the stores", () => {
    expect(canAccess("staff", "/stores/uniform/history")).toBe(true);
    for (const role of ["snco", "nco", undefined])
      expect(canAccess(role, "/stores/uniform/history")).toBe(false);
  });
});
