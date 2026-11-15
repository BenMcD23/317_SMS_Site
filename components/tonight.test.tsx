// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok", role: "nco" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));

import { Tonight } from "@/components/tonight";
import { renderWithQuery } from "@/tests/render-with-query";

// A Wednesday parade night, half past seven in London.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T19:30:00Z"));
});
afterEach(() => vi.useRealTimers());

const cadet = (cin: number, checked_in: boolean) => ({ cin, first_name: "A", last_name: "B", checked_in });

function api(door: unknown, plans: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = String(url).includes("/check-ins") ? door : plans;
      return new Response(JSON.stringify(body), { status });
    })
  );
}

const plan = (id: number, session_name: string, session_date: string | null, session_ic = "") => ({
  id,
  session_name,
  session_ic,
  session_date,
});

describe("Tonight on the dashboard", () => {
  it("stays out of the way on a night with nothing on", async () => {
    api({ checked_in: 0, cadets: [cadet(1, false)] }, { plans: [plan(1, "Drill", "2026-11-11T00:00:00")] });
    const { container } = renderWithQuery(<Tonight />);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows how many are in at the door, linking to Check-in", async () => {
    api({ checked_in: 2, cadets: [cadet(1, true), cadet(2, true), cadet(3, false)] }, { plans: [] });
    renderWithQuery(<Tonight />);
    const link = await screen.findByRole("link", { name: /Check-in/ });
    expect(link).toHaveAttribute("href", "/check-in");
    expect(link).toHaveTextContent("2 of 3 cadets in");
  });

  it("lists tonight's session plans, and only tonight's, each linking to its plan", async () => {
    api(
      { checked_in: 0, cadets: [cadet(1, false)] },
      {
        plans: [
          plan(7, "Radio", "2026-11-18T00:00:00", "Sgt Ng"),
          plan(8, "Drill", "2026-11-18T00:00:00"),
          plan(9, "First Aid", "2026-11-20T00:00:00"),
          plan(10, "Undated", null),
        ],
      }
    );
    renderWithQuery(<Tonight />);
    const list = within(await screen.findByRole("list"));
    expect(list.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
      "/check-in",
      "/session-plans/8",
      "/session-plans/7",
    ]);
    expect(list.getByRole("link", { name: /Radio/ })).toHaveTextContent("Session plan · Sgt Ng");
    // A plan on but nobody in yet: the door still shows, and says so.
    expect(list.getByRole("link", { name: /Check-in/ })).toHaveTextContent("Nobody in yet");
  });

  it("hides itself, rather than crashing, when both lookups fail", async () => {
    api({ detail: "boom" }, { detail: "boom" }, 500);
    const { container } = renderWithQuery(<Tonight />);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });

  it("still shows the door when the plans can't be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/check-ins")
          ? new Response(JSON.stringify({ checked_in: 1, cadets: [cadet(1, true)] }))
          : new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 })
      )
    );
    renderWithQuery(<Tonight />);
    expect(await screen.findByRole("link", { name: /Check-in/ })).toHaveTextContent("1 of 1 cadets in");
  });
});
