// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok", role: "staff" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import CadetsPage from "@/app/cadets/overview/page";

const ROSTER = [
  { cin: 1, first_name: "Amy", last_name: "Able", rank: "Cadet", flight: "A" },
  { cin: 2, first_name: "Ben", last_name: "Baker", rank: "Cpl", flight: "B" },
  { cin: 3, first_name: "Cal", last_name: "Cole", rank: "Sgt", flight: "B" },
  { cin: 4, first_name: "Dee", last_name: "Dale", rank: null, flight: null },
];

function respond(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  );
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CadetsPage />
    </QueryClientProvider>
  );
}

const names = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getByRole("link").textContent);

beforeEach(() => router.push.mockClear());

describe("cadet list", () => {
  it("narrows to one flight with a tap, and back to everyone with All", async () => {
    respond(ROSTER);
    renderPage();
    await screen.findByText("4 cadets on strength");

    await userEvent.click(screen.getByRole("radio", { name: "B Flight" }));
    expect(names()).toEqual(["Baker, Ben", "Cole, Cal"]);
    expect(screen.getByText("Showing 2 of 4 cadets")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "All" }));
    expect(names()).toHaveLength(4);
  });

  it("combines the flight with the search box", async () => {
    respond(ROSTER);
    renderPage();
    await screen.findByText("4 cadets on strength");
    await userEvent.click(screen.getByRole("radio", { name: "B Flight" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Search cadets" }), "able");
    expect(screen.getByText('Nothing matches "able" in B Flight.')).toBeInTheDocument();
  });

  it("links each name to the cadet's record so it opens from the keyboard or in a new tab", async () => {
    respond(ROSTER);
    renderPage();
    expect(await screen.findByRole("link", { name: "Able, Amy" })).toHaveAttribute("href", "/cadets/1");
  });

  it("offers no flight filter when everyone is in the same flight", async () => {
    respond([ROSTER[0]]);
    renderPage();
    await screen.findByText("1 cadet on strength");
    expect(screen.queryByRole("group", { name: "Filter by flight" })).not.toBeInTheDocument();
  });

  it("shows the API's error instead of an empty list when the roster fails to load", async () => {
    respond({ detail: "Database unavailable" }, 500);
    renderPage();
    await waitFor(() => expect(screen.getByText("Database unavailable")).toBeInTheDocument());
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
