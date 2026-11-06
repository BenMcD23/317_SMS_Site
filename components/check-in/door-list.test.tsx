// @vitest-environment jsdom
// Tonight's door list: who shows under each filter, an NCO ticking someone in
// and taking a wrong one off, and the empty, error and outage states.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DoorList } from "@/components/check-in/door-list";
import type { DoorCadet, DoorList as DoorListBody } from "@/lib/check-ins";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "nco", user: { email: "nco@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const cadet = (cin: number, first: string, last: string, over: Partial<DoorCadet> = {}): DoorCadet => ({
  cin,
  first_name: first,
  last_name: last,
  rank: "Cadet",
  flight: "A",
  checked_in: false,
  checked_in_at: null,
  checked_in_by: null,
  ...over,
});

const IN_BY_PHONE = cadet(1, "Amy", "Able", { checked_in: true, checked_in_at: "2026-11-09T19:05:00" });
const IN_BY_NCO = cadet(2, "Zoë", "Ørsted", {
  checked_in: true,
  checked_in_at: "2026-11-09T19:12:00",
  checked_in_by: "Nina Corporal",
});
const WAITING = cadet(3, "Ben", "Baker", { flight: null, rank: null });

function body(cadets: DoorCadet[]): DoorListBody {
  return { date: "2026-11-09", today: true, checked_in: cadets.filter((c) => c.checked_in).length, cadets };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function api({
  list = () => json(body([IN_BY_PHONE, IN_BY_NCO, WAITING])),
  write = (): Response =>
    json({
      ...WAITING,
      checked_in: true,
      checked_in_at: "2026-11-09T19:20:00",
      checked_in_by: "Nina Corporal",
      already: false,
    }),
}: { list?: () => Response | Promise<Response>; write?: () => Response | Promise<Response> } = {}) {
  const fetchMock = vi.fn(async (_input: string, init?: RequestInit) =>
    init?.method && init.method !== "GET" ? write() : list()
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const writes = (fetchMock: ReturnType<typeof api>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== "GET");

describe("Door list", () => {
  it("counts who's in and starts on the cadets not here yet", async () => {
    api();
    renderWithQuery(<DoorList />);
    expect(await screen.findByText("Baker, Ben")).toBeVisible();
    expect(screen.queryByText("Able, Amy")).not.toBeInTheDocument();
    expect(screen.getByText("Checked in", { selector: "*:not(button)" })).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("the checked-in view says when and how each cadet got in", async () => {
    api();
    renderWithQuery(<DoorList />);
    await userEvent.click(await screen.findByRole("radio", { name: "Checked in" }));
    expect(screen.getByText("In at 19:05 with their phone")).toBeVisible();
    expect(screen.getByText("In at 19:12 by Nina Corporal")).toBeVisible();
    expect(screen.queryByText("Baker, Ben")).not.toBeInTheDocument();
  });

  it("search finds a cadet by either name, accents and all", async () => {
    api();
    renderWithQuery(<DoorList />);
    await userEvent.click(await screen.findByRole("radio", { name: "Everyone" }));
    await userEvent.type(screen.getByLabelText("Find a cadet"), "ørst");
    expect(screen.getByText("Ørsted, Zoë")).toBeVisible();
    expect(screen.queryByText("Able, Amy")).not.toBeInTheDocument();
  });

  it("a search that matches nobody says so", async () => {
    api();
    renderWithQuery(<DoorList />);
    await userEvent.type(await screen.findByLabelText("Find a cadet"), "zzz");
    expect(screen.getByText("Nobody by that name")).toBeVisible();
  });

  it("ticking in a cadet without their phone sends their CIN and moves them across", async () => {
    const fetchMock = api();
    renderWithQuery(<DoorList />);
    await userEvent.click(await screen.findByRole("button", { name: "Check in Ben Baker" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Ben Baker checked in."));
    const [url, init] = writes(fetchMock)[0];
    expect(String(url)).toMatch(/\/check-ins$/);
    expect(JSON.parse(String(init!.body))).toEqual({ cin: 3 });
    expect(screen.getByText("Everyone's in")).toBeVisible();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("someone already in says so rather than claiming a new check-in", async () => {
    api({ write: () => json({ ...IN_BY_PHONE, already: true }) });
    renderWithQuery(<DoorList />);
    await userEvent.click(await screen.findByRole("radio", { name: "Everyone" }));
    // The list is stale: they checked in on their phone a moment ago.
    await userEvent.click(screen.getByRole("button", { name: "Check in Ben Baker" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Ben Baker was already in."));
  });

  it("a refused tick shows the API's reason and leaves them waiting", async () => {
    api({ write: () => json({ detail: "That cadet isn't on the roster" }, 404) });
    renderWithQuery(<DoorList />);
    await userEvent.click(await screen.findByRole("button", { name: "Check in Ben Baker" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That cadet isn't on the roster"));
    expect(screen.getByText("Baker, Ben")).toBeVisible();
  });

  it("undo asks first, then takes the check-in off", async () => {
    const fetchMock = api({ write: () => new Response(null, { status: 204 }) });
    renderWithQuery(<DoorList />);
    await userEvent.click(await screen.findByRole("radio", { name: "Checked in" }));
    await userEvent.click(screen.getByRole("button", { name: "Take Amy Able's check-in off" }));
    expect(writes(fetchMock)).toHaveLength(0);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/The Bader register isn't changed/)).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    const [url, init] = writes(fetchMock)[0];
    expect(String(url)).toMatch(/\/check-ins\/1$/);
    expect(init!.method).toBe("DELETE");
    await waitFor(() => expect(screen.queryByText("Able, Amy")).not.toBeInTheDocument());
  });

  it("an undo that fails says why and reloads the list", async () => {
    const fetchMock = api({ write: () => json({ detail: "They aren't checked in that night" }, 404) });
    renderWithQuery(<DoorList />);
    await userEvent.click(await screen.findByRole("radio", { name: "Checked in" }));
    const before = fetchMock.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Take Amy Able's check-in off" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("They aren't checked in that night"));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before + 1));
  });

  it("no signal on a tick is an error, not a hang", async () => {
    api({ write: () => Promise.reject(new TypeError("Failed to fetch")) as never });
    renderWithQuery(<DoorList />);
    await userEvent.click(await screen.findByRole("button", { name: "Check in Ben Baker" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Server unreachable."));
  });

  it("an empty roster says where cadets come from", async () => {
    api({ list: () => json(body([])) });
    renderWithQuery(<DoorList />);
    expect(await screen.findByText("No cadets on the roster")).toBeVisible();
  });

  it("everyone in shows that rather than an empty list", async () => {
    api({ list: () => json(body([IN_BY_PHONE])) });
    renderWithQuery(<DoorList />);
    expect(await screen.findByText("Everyone's in")).toBeVisible();
  });

  it("a list that fails to load shows the API's error", async () => {
    api({ list: () => json({ detail: "Staff or NCO access required" }, 403) });
    renderWithQuery(<DoorList />);
    expect(await screen.findByText("Staff or NCO access required")).toBeVisible();
  });

  it("an error body where the list should be is an error, not a crash", async () => {
    api({ list: () => json({ detail: "odd" }) });
    renderWithQuery(<DoorList />);
    expect(await screen.findByText("The door list didn't load.")).toBeVisible();
  });
});
