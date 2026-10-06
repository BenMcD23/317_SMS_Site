// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import UsagePage from "@/app/usage/page";
import { OWNER_EMAIL } from "@/lib/config";

// One stable object per identity, like the real hook — swapped per test.
const OWNER = {
  data: { id_token: "tok", role: "staff", user: { email: OWNER_EMAIL.toUpperCase(), name: "Ben" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
const STAFF = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk", name: "Sam Staff" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
let session: typeof OWNER = OWNER;

const signIn = vi.fn(() => Promise.resolve());
vi.mock("next-auth/react", () => ({ useSession: () => session, signIn: () => signIn() }));

const USAGE = {
  days: 30,
  since: "2026-09-07",
  total_calls: 12,
  routes: [
    {
      method: "GET",
      route: "/cadets/{cin}",
      calls: 9,
      users: 2,
      roles: { cadet: 2, staff: 7 },
      last_used: "2026-10-06T12:00:00",
    },
    {
      method: "POST",
      route: "/stores/orders",
      calls: 3,
      users: 1,
      roles: { nco: 3 },
      last_used: "2026-10-01T09:30:00",
    },
  ],
  users: [
    { email: "staff@317atc.co.uk", role: "staff", calls: 7, routes: 1, last_used: "2026-10-06T12:00:00" },
    { email: "nco@317atc.co.uk", role: "nco", calls: 3, routes: 1, last_used: "2026-10-01T09:30:00" },
  ],
  unused: [{ method: "GET", route: "/stats/history" }],
};

const json =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status });

function stubApi(reply: () => Response | Promise<Response>) {
  // A fresh Response per call — a body can only be read once.
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(reply())
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  session = OWNER;
  signIn.mockClear();
  try {
    sessionStorage.clear();
  } catch {
    // jsdom always has it; the guard mirrors the app's own.
  }
});

describe("Usage page", () => {
  it("turns away anyone but the owner without asking the API", () => {
    session = STAFF;
    const fetchMock = stubApi(json(USAGE));
    render(<UsagePage />);
    expect(screen.getByText("Not authorised")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads the last 30 days with the owner's token and ranks endpoints by calls", async () => {
    const fetchMock = stubApi(json(USAGE));
    render(<UsagePage />);

    const rows = await screen.findAllByRole("row");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/usage\?days=30$/);
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");

    // Header row, then the endpoints in the order the API ranked them.
    expect(rows[1]).toHaveTextContent("GET /cadets/{cin}92staff 7 · cadet 206 Oct 2026, 12:00");
    expect(rows[2]).toHaveTextContent("POST /stores/orders31nco 301 Oct 2026, 09:30");
    expect(screen.getByText("2 / 3")).toBeInTheDocument(); // endpoints used of all served
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("changing the window reloads that many days", async () => {
    const fetchMock = stubApi(json(USAGE));
    const user = userEvent.setup();
    render(<UsagePage />);
    await screen.findByText("/stores/orders");

    await user.click(screen.getByRole("radio", { name: "Last 7 days" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/usage\?days=7$/);
  });

  it("shows who uses the site and which endpoints nobody called", async () => {
    stubApi(json(USAGE));
    const user = userEvent.setup();
    render(<UsagePage />);
    await screen.findByText("/stores/orders");

    await user.click(screen.getByRole("tab", { name: "People (2)" }));
    const people = screen.getAllByRole("row");
    expect(people[1]).toHaveTextContent("staff@317atc.co.ukstaff7106 Oct 2026, 12:00");
    expect(people[2]).toHaveTextContent("nco@317atc.co.uknco3101 Oct 2026, 09:30");

    await user.click(screen.getByRole("tab", { name: "Unused (1)" }));
    expect(screen.getByRole("listitem")).toHaveTextContent("GET /stats/history");
  });

  it("the filter narrows endpoints by path and people by role", async () => {
    stubApi(json(USAGE));
    const user = userEvent.setup();
    render(<UsagePage />);
    await screen.findByText("/stores/orders");

    await user.type(screen.getByRole("textbox", { name: "Filter" }), "stores");
    expect(screen.queryByText("/cadets/{cin}")).not.toBeInTheDocument();
    expect(screen.getByText("/stores/orders")).toBeInTheDocument();

    await user.clear(screen.getByRole("textbox", { name: "Filter" }));
    await user.type(screen.getByRole("textbox", { name: "Filter" }), "nco");
    await user.click(screen.getByRole("tab", { name: "People (2)" }));
    const table = screen.getByRole("table");
    expect(within(table).queryByText("staff@317atc.co.uk")).not.toBeInTheDocument();
    expect(within(table).getByText("nco@317atc.co.uk")).toBeInTheDocument();
  });

  it("with no recorded use it says so instead of showing empty tables", async () => {
    stubApi(json({ ...USAGE, total_calls: 0, routes: [], users: [] }));
    const user = userEvent.setup();
    render(<UsagePage />);
    expect(await screen.findByText("No calls recorded in the last 30 days.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "People (0)" }));
    expect(screen.getByText("No one signed in has used the API in this window.")).toBeInTheDocument();
  });

  it("a 403 shows the API's own reason", async () => {
    stubApi(json({ detail: "Owner access required" }, 403));
    render(<UsagePage />);
    expect(await screen.findByText("Owner access required")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("a validation error list is flattened, not shown as [object Object]", async () => {
    stubApi(json({ detail: [{ msg: "Input should be less than or equal to 180" }] }, 422));
    render(<UsagePage />);
    expect(await screen.findByText("Input should be less than or equal to 180")).toBeInTheDocument();
  });

  it("a 500 with no JSON body still gives a readable error", async () => {
    stubApi(() => new Response("Internal Server Error", { status: 500 }));
    render(<UsagePage />);
    expect(await screen.findByText("Failed to load usage (500)")).toBeInTheDocument();
  });

  it("an unreachable API shows an error instead of loading forever", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    );
    render(<UsagePage />);
    expect(await screen.findByText("Failed to fetch")).toBeInTheDocument();
  });

  it("a 401 mid-session sends the owner to sign in again", async () => {
    stubApi(json({ detail: "Invalid Token" }, 401));
    render(<UsagePage />);
    await vi.waitFor(() => expect(signIn).toHaveBeenCalled());
  });
});
