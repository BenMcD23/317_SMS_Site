// @vitest-environment jsdom
// The programme list: each month with its status and open comments, starting
// a month (from empty nights or the imported doc), what NCOs see, and the
// empty and error states.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProgrammePage from "@/app/programme/page";
import type { MonthList } from "@/lib/programme-builder";
import { renderWithQuery } from "@/tests/render-with-query";

const sessions = {
  staff: {
    data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
    status: "authenticated",
  },
  nco: {
    data: { id_token: "tok", role: "nco", user: { email: "nco@317atc.co.uk" } },
    status: "authenticated",
  },
};
let session = sessions.staff;
vi.mock("next-auth/react", () => ({ useSession: () => session, signIn: vi.fn(), signOut: vi.fn() }));
const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/programme" }));

const LIST: MonthList = {
  programmes: [
    {
      month: "2026-12",
      name: "December 2026 programme",
      status: "changed",
      nights: 4,
      sessions: 19,
      open_comments: 2,
      updated_at: "2026-11-25T12:00:00",
      updated_by: "Sam Staff",
      published_at: "2026-11-24T12:00:00",
    },
    {
      month: "2026-11",
      name: "November 2026 programme",
      status: "published",
      nights: 1,
      sessions: 1,
      open_comments: 0,
      updated_at: "2026-10-25T12:00:00",
      updated_by: null,
      published_at: "2026-10-25T12:00:00",
    },
  ],
  record_months: ["2027-01"],
  copy_months: ["2026-12", "2026-11", "2024-03"],
  parade_weekdays: [0],
  next_month: "2027-01",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function api(list: MonthList | Response = LIST, create: () => Response = () => json({}, 201)) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "POST" ? create() : list instanceof Response ? list : json(list)
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  // Radix's Select needs these, which jsdom lacks.
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  session = sessions.staff;
  router.push.mockClear();
});

describe("Programme list", () => {
  it("lists each month with its status, size and open comments", async () => {
    api();
    renderWithQuery(<ProgrammePage />);
    const list = await screen.findByRole("list", { name: "Programmes" });
    const december = within(list).getByRole("link", { name: /December 2026/ });
    expect(december).toHaveAttribute("href", "/programme/2026-12");
    expect(within(december).getByText("Changed since publishing")).toBeInTheDocument();
    expect(within(december).getByText(/4 nights, 19 sessions/)).toBeInTheDocument();
    expect(within(december).getByLabelText("2 open comments")).toBeInTheDocument();
    expect(within(list).getByText(/1 night, 1 session/)).toBeInTheDocument();
  });

  it("starts next month from the imported doc and opens it", async () => {
    const fetchMock = api();
    const user = userEvent.setup();
    renderWithQuery(<ProgrammePage />);
    await user.click(await screen.findByRole("button", { name: "New programme" }));
    const dialog = await screen.findByRole("dialog", { name: "New programme" });
    await user.click(within(dialog).getByRole("radio", { name: "The imported doc" }));
    await user.click(within(dialog).getByRole("button", { name: "Start January 2027" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/programme/2027-01"));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({ month: "2027-01", start: "record", copy_from: null });
  });

  it("copies an old doc's month that was never built", async () => {
    const fetchMock = api();
    const user = userEvent.setup();
    renderWithQuery(<ProgrammePage />);
    await user.click(await screen.findByRole("button", { name: "New programme" }));
    const dialog = await screen.findByRole("dialog", { name: "New programme" });
    await user.click(within(dialog).getByRole("radio", { name: "Another month" }));
    await user.click(within(dialog).getByLabelText("Copy"));
    await user.click(await screen.findByRole("option", { name: "March 2024 (old doc)" }));
    await user.click(within(dialog).getByRole("button", { name: "Start January 2027" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/programme/2027-01"));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({
      month: "2027-01",
      start: "copy",
      copy_from: "2024-03",
    });
  });

  it("won't start a month that already has one", async () => {
    api();
    const user = userEvent.setup();
    renderWithQuery(<ProgrammePage />);
    await user.click(await screen.findByRole("button", { name: "New programme" }));
    const dialog = await screen.findByRole("dialog", { name: "New programme" });
    await user.click(within(dialog).getByRole("button", { name: "December 2026" }));
    expect(within(dialog).getByText("That month already has a programme.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Start December 2026" })).toBeDisabled();
  });

  it("shows the API's reason when a month can't be started", async () => {
    api(LIST, () => json({ detail: "That month already has a programme" }, 409));
    const user = userEvent.setup();
    renderWithQuery(<ProgrammePage />);
    await user.click(await screen.findByRole("button", { name: "New programme" }));
    await user.click(await screen.findByRole("button", { name: "Start January 2027" }));
    expect(await screen.findByText("That month already has a programme")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("gives NCOs the list without a way to start one", async () => {
    session = sessions.nco;
    api();
    renderWithQuery(<ProgrammePage />);
    expect(await screen.findByRole("list", { name: "Programmes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New programme" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Publish it from Drive" })).not.toBeInTheDocument();
  });

  it("says so when there are none yet", async () => {
    api({ ...LIST, programmes: [] });
    renderWithQuery(<ProgrammePage />);
    expect(await screen.findByText("No programmes yet")).toBeInTheDocument();
  });

  it("shows an error, not an empty list, when the API fails", async () => {
    api(json({ detail: "Database unavailable" }, 503));
    renderWithQuery(<ProgrammePage />);
    expect(await screen.findByText("Database unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No programmes yet")).not.toBeInTheDocument();
  });
});
