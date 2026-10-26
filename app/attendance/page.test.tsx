// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// One stable object, like the real hook.
const SESSION = { data: { id_token: "tok", role: "staff", user: { email: "s@x" } }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));

import AttendancePage from "@/app/attendance/page";
import { renderWithQuery } from "@/tests/render-with-query";

const counts = (present: number, absent = 0) => ({ present, authorised: 0, absent });
const NIGHTS = [
  {
    date: "2026-10-06",
    registerType: "Parade Night",
    cadets: counts(20, 2),
    ncos: counts(4),
    staff: counts(3),
  },
  {
    date: "2026-10-08",
    registerType: "Parade Night",
    cadets: counts(18, 4),
    ncos: counts(3),
    staff: counts(2),
  },
];
const NIGHT_DETAIL = {
  date: "2026-10-08",
  registerType: "Parade Night",
  cadets: [
    {
      cin: 1,
      name: "Amy Able",
      rank: "Cdt",
      isNco: false,
      status: "Present",
      state: "present",
      registerType: "Parade Night",
    },
  ],
  staff: [],
};

function stubApi(night: () => Response) {
  const fetch = vi.fn(async (url: string) => {
    if (url === "/api/attendance/nights") return new Response(JSON.stringify(NIGHTS), { status: 200 });
    if (url.startsWith("/api/attendance/nights/")) return night();
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("Attendance page", () => {
  it("opening a night shows who was on that night's register", async () => {
    const fetch = stubApi(() => new Response(JSON.stringify(NIGHT_DETAIL), { status: 200 }));
    renderWithQuery(<AttendancePage />);
    await userEvent.click(await screen.findByRole("button", { name: "8 Oct 2026" }));
    expect(await screen.findByText("Amy Able")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/attendance/nights/2026-10-08?registerType=Parade%20Night",
      expect.anything()
    );
  });

  it("a night that fails to load says so instead of loading forever", async () => {
    stubApi(() => new Response(JSON.stringify({ detail: "Register not found" }), { status: 404 }));
    renderWithQuery(<AttendancePage />);
    await userEvent.click(await screen.findByRole("button", { name: "6 Oct 2026" }));
    expect(await screen.findByText("Register not found")).toBeInTheDocument();
  });

  it("an error body where the list should be is an error, not an empty page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "Database unavailable" }), { status: 500 }))
    );
    renderWithQuery(<AttendancePage />);
    expect(await screen.findByText("Database unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/No attendance recorded yet/)).toBeNull();
  });
});
