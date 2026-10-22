// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BadgesToGive } from "@/components/badges/badges-to-give";
import type { BadgeToGive } from "@/lib/badge-orders";

const SESSION = { data: { id_token: "tok", role: "staff" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION }));

const badge = (n: number, stage: BadgeToGive["stage"], extra: Partial<BadgeToGive> = {}): BadgeToGive => ({
  orderId: String(n),
  itemId: String(n),
  badgeName: `Badge ${n}`,
  cadetName: `Cadet ${n}`,
  cadetCin: n,
  orderedAt: "2026-09-01T18:00:00",
  stage,
  ...extra,
});

function stub(body: unknown, status = 200) {
  const fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function renderList(limit?: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <BadgesToGive limit={limit} />
      </QueryClientProvider>
    );
  });
  for (let i = 0; i < 5; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
}

describe("BadgesToGive", () => {
  it("lists each badge with its cadet, the word for its stage, and a link to the orders", async () => {
    stub([
      badge(1, "notified", { cadetName: "Zoë Ó Briain", badgeName: "Leadership – Blue" }),
      badge(2, "not_ordered"),
    ]);
    await renderList();
    const row = screen.getByRole("link", { name: /Zoë Ó Briain/ });
    expect(row.getAttribute("href")).toBe("/stores/badges/orders");
    expect(within(row).getByText(/Leadership – Blue · ordered 1 Sept 2026/)).toBeTruthy();
    expect(within(row).getByText("Cadet told to collect")).toBeTruthy();
    expect(within(screen.getByRole("link", { name: /Cadet 2/ })).getByText("Not ordered yet")).toBeTruthy();
  });

  it("sums up how many are ready to hand over out of all those waiting", async () => {
    stub([badge(1, "notified"), badge(2, "in_hand"), badge(3, "on_order"), badge(4, "not_ordered")]);
    await renderList();
    expect(screen.getByText("2 ready to hand over · 4 waiting in all")).toBeTruthy();
  });

  it("collapses a long list and opens it on request", async () => {
    stub([1, 2, 3, 4].map((n) => badge(n, "on_order")));
    await renderList(2);
    // The rest are rendered for print only, hidden on screen.
    expect(screen.getByRole("link", { name: /Cadet 3/ }).closest("li")?.className).toContain("print-only");
    fireEvent.click(screen.getByRole("button", { name: "Show all 4" }));
    expect(screen.getByRole("link", { name: /Cadet 3/ }).closest("li")?.className).not.toContain(
      "print-only"
    );
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeTruthy();
  });

  it("says when every badge has been given", async () => {
    stub([]);
    await renderList();
    expect(screen.getByText("Every badge has been given out")).toBeTruthy();
  });

  it("an API error shows the error rather than an empty list", async () => {
    stub({ detail: "Staff access required" }, 403);
    await renderList();
    expect(screen.getByText("Couldn't load the badges to give out")).toBeTruthy();
    expect(screen.getByText("Staff access required")).toBeTruthy();
    expect(screen.queryByText("Every badge has been given out")).toBeNull();
  });

  it("an API that can't be reached is an error, not 'all given'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    );
    await renderList();
    expect(screen.getByText("Couldn't load the badges to give out")).toBeTruthy();
    expect(screen.queryByText("Every badge has been given out")).toBeNull();
  });
});
