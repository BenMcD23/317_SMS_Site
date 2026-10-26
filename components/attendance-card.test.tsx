// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));

import { AttendanceCard } from "@/components/attendance-card";
import { renderWithQuery } from "@/tests/render-with-query";

const reply = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  );

describe("AttendanceCard", () => {
  it("shows the register it was given", async () => {
    reply(200, [
      {
        id: 1,
        date: "2026-10-06T19:00:00",
        registerType: "Parade Night",
        status: "Present",
        state: "present",
        unit: "317",
      },
    ]);
    renderWithQuery(<AttendanceCard baseUrl="/api/cadets/1/attendance" />);
    expect(await screen.findByText("Present")).toBeInTheDocument();
  });

  it("an empty register says nothing's recorded", async () => {
    reply(200, []);
    renderWithQuery(<AttendanceCard baseUrl="/api/cadets/1/attendance" />);
    expect(await screen.findByText(/No attendance recorded/)).toBeInTheDocument();
  });

  it("a failed lookup is an error, not 'no attendance'", async () => {
    reply(503, { error: "API unreachable" });
    renderWithQuery(<AttendanceCard baseUrl="/api/cadets/1/attendance" />);
    expect(await screen.findByText("API unreachable")).toBeInTheDocument();
    expect(screen.queryByText(/No attendance recorded/)).toBeNull();
  });
});
