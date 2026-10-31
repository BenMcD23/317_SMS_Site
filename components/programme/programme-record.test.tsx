// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BACKFILL_FROM, ProgrammeRecord } from "@/components/programme/programme-record";
import { OWNER_EMAIL } from "@/lib/config";
import { renderWithQuery } from "@/tests/render-with-query";

const STAFF = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk", name: "Sam" } },
  status: "authenticated",
};
const OWNER = { ...STAFF, data: { ...STAFF.data, user: { email: OWNER_EMAIL, name: "Ben" } } };
let session: typeof STAFF = STAFF;
vi.mock("next-auth/react", () => ({ useSession: () => session }));

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({
  toast: { success: (m: string) => toast.success(m), error: (m: string) => toast.error(m) },
}));

const MONTHS = [
  { month: "2026-10", nights: 9, sessions: 54, imported_at: "2026-10-25T20:30:00" },
  { month: "2026-09", nights: 8, sessions: 47, imported_at: null },
];

type Route = { status?: number; body: unknown };

function stubApi(routes: Record<string, Route | Route[]>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const path = new URL(url, "http://x").pathname;
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      let route = routes[`${method} ${path}`];
      if (Array.isArray(route)) route = route.length > 1 ? route.shift()! : route[0];
      if (!route) return new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 });
      return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
    })
  );
  return calls;
}

async function show(month = "10", year = "2026") {
  await act(async () => {
    renderWithQuery(<ProgrammeRecord month={month} year={year} />);
  });
}

beforeEach(() => {
  session = STAFF;
  toast.success.mockClear();
  toast.error.mockClear();
});

describe("ProgrammeRecord", () => {
  it("lists the imported months", async () => {
    stubApi({ "GET /programme/months": { body: MONTHS } });
    await show();
    const list = within(await screen.findByRole("list", { name: "Imported months" }));
    expect(list.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("October 2026"),
      expect.stringContaining("September 2026"),
    ]);
    expect(list.getByText(/9 nights · 54 sessions/)).toBeInTheDocument();
  });

  it("imports the picked month and refreshes the list", async () => {
    const calls = stubApi({
      "GET /programme/months": [{ body: [] }, { body: MONTHS }],
      "POST /programme/import": { body: { month: "2026-10", nights: 9, sessions: 54 } },
    });
    await show("10", "2026");
    await userEvent.setup().click(screen.getByRole("button", { name: "Import October 2026" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("October 2026: 9 nights, 54 sessions"));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ month: 10, year: 2026 });
    expect(await screen.findByRole("list", { name: "Imported months" })).toBeInTheDocument();
  });

  it("a month with no nights in its doc is a warning, not a success", async () => {
    stubApi({
      "GET /programme/months": { body: [] },
      "POST /programme/import": {
        body: { month: "2026-08", nights: 0, sessions: 0, skipped: "no nights in the doc" },
      },
    });
    await show("8", "2026");
    await userEvent.setup().click(screen.getByRole("button", { name: "Import August 2026" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("not imported")));
  });

  it.each([
    [404, { detail: "No '10_26' programme doc in the 2026 folder" }, "No '10_26' programme doc"],
    [422, { detail: "Could not identify the programme table columns" }, "Could not identify"],
    [502, { detail: "Couldn't read the programme doc from Google Drive" }, "Couldn't read"],
  ])("an import that fails with %s says why", async (status, body, message) => {
    stubApi({ "GET /programme/months": { body: [] }, "POST /programme/import": { status, body } });
    await show();
    await userEvent.setup().click(screen.getByRole("button", { name: "Import October 2026" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(message)));
  });

  it("with nothing imported, says so", async () => {
    stubApi({ "GET /programme/months": { body: [] } });
    await show();
    expect(await screen.findByText("No months imported yet.")).toBeInTheDocument();
  });

  it("a list that fails to load says so, and importing still works", async () => {
    stubApi({ "GET /programme/months": { status: 500, body: { detail: "Database down" } } });
    await show();
    expect(await screen.findByText("Database down")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import October 2026" })).toBeEnabled();
  });

  it("only the owner can import every past month, after a confirm", async () => {
    stubApi({ "GET /programme/months": { body: [] } });
    await show();
    expect(screen.queryByRole("button", { name: /Import all since/ })).not.toBeInTheDocument();

    session = OWNER;
    const calls = stubApi({
      "GET /programme/months": { body: [] },
      "POST /programme/backfill": { status: 202, body: { months: 35, from: BACKFILL_FROM, to: "2026-11" } },
    });
    await show();
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Import all since January 2024" }).at(-1)!);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Importing 35 months"))
    );
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ start: "2024-01" });
  });

  it("a backfill the API refuses says why", async () => {
    session = OWNER;
    stubApi({
      "GET /programme/months": { body: [] },
      "POST /programme/backfill": { status: 403, body: { detail: "Owner access required" } },
    });
    await show();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Import all since January 2024" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Owner access required"));
  });
});
