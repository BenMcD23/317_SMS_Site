// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok", role: "staff" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

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

  it("lists cadets by surname and sorts rank as a ladder, not alphabetically", async () => {
    respond([
      { cin: 1, first_name: "Ash", last_name: "Ames", rank: "Sgt", flight: "A" },
      { cin: 2, first_name: "Bo", last_name: "Zane", rank: "Cadet", flight: "A" },
      { cin: 3, first_name: "Cy", last_name: "Moss", rank: null, flight: "A" },
      { cin: 4, first_name: "Di", last_name: "Bell", rank: "FS", flight: "A" },
      { cin: 5, first_name: "Ed", last_name: "Cole", rank: "Cpl", flight: "A" },
    ]);
    renderPage();
    await screen.findByText("5 cadets on strength");
    expect(names()).toEqual(["Ames, Ash", "Bell, Di", "Cole, Ed", "Moss, Cy", "Zane, Bo"]);

    const rank = () => within(screen.getByRole("columnheader", { name: /Rank/ })).getByRole("button");
    await userEvent.click(rank());
    // Cadet < Cpl < Sgt < FS (alphabetical would put FS before Sgt), and a
    // cadet with no rank on record goes last.
    expect(names()).toEqual(["Zane, Bo", "Cole, Ed", "Ames, Ash", "Bell, Di", "Moss, Cy"]);
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

describe("cadets no longer on SMS", () => {
  const GONE = { cin: 9, first_name: "Finley", last_name: "Kay", rank: "Cadet", flight: "A" };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-10-16T12:00:00") });
    SESSION.data.role = "staff";
  });
  afterEach(() => {
    vi.useRealTimers();
    SESSION.data.role = "staff";
  });

  it("names each one and how long they've been gone", async () => {
    respond([ROSTER[0], { ...GONE, missing_since: "2026-10-07T03:48:00" }]);
    renderPage();
    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent("1 cadet isn't on SMS any more");
    expect(banner).toHaveTextContent("Finley Kay hasn't been seen on SMS for 9 days (since 7 Oct 2026)");
  });

  it("shows no banner when everyone is on SMS", async () => {
    respond(ROSTER.map((c) => ({ ...c, missing_since: null })));
    renderPage();
    await screen.findByText("4 cadets on strength");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lets staff remove one after confirming, then reloads the list", async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "DELETE"
        ? new Response(JSON.stringify({ status: "success", kept_orders: 1 }))
        : new Response(JSON.stringify([ROSTER[0], { ...GONE, missing_since: "2026-10-07T03:48:00" }]))
    );
    vi.stubGlobal("fetch", fetch);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/cadets\/9$/),
        expect.objectContaining({ method: "DELETE" })
      )
    );
    await waitFor(() =>
      expect(fetch.mock.calls.filter(([, i]) => !i?.method || i.method === "GET").length).toBe(2)
    );
  });

  it("doesn't offer removal to an SNCO", async () => {
    SESSION.data.role = "snco";
    respond([{ ...GONE, missing_since: "2026-10-07T03:48:00" }]);
    renderPage();
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("shows the API's reason when a removal is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "DELETE"
          ? new Response(JSON.stringify({ detail: "This cadet is still on SMS, so can't be removed." }), {
              status: 409,
            })
          : new Response(JSON.stringify([{ ...GONE, missing_since: "2026-10-07T03:48:00" }]))
      )
    );
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("This cadet is still on SMS, so can't be removed.")
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});
