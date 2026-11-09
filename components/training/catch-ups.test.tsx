// @vitest-environment jsdom
// The Catch-ups tab: each lesson with who still needs it, narrowing by
// flight, and the empty and error states.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CatchUps } from "@/components/training/catch-ups";
import type { CatchUp } from "@/lib/training";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));

const ROWS: CatchUp[] = [
  {
    subject_key: "acp_32_2",
    name: "Basic Navigation",
    part: 2,
    parts: 3,
    code: "ABCD2345",
    ran: [{ date: "2026-10-12", flights: ["A", "B"], split: false }],
    missing: [
      { cin: 1, first_name: "Amy", last_name: "Able", rank: "Cadet", flight: "A", was_in: true },
      { cin: 2, first_name: "Zoë", last_name: "Ørsted", rank: null, flight: "B", was_in: false },
    ],
  },
  {
    subject_key: "custom_ops",
    name: "Flying Ops",
    part: 1,
    parts: 1,
    code: null,
    ran: [{ date: "2026-10-05", flights: ["C"], split: false }],
    missing: [],
  },
];

function api(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
    )
  );
}

describe("Catch-ups", () => {
  it("lists each lesson the programme ran, when, and how many still need it", async () => {
    api(ROWS);
    renderWithQuery(<CatchUps />);
    expect(await screen.findByText("Basic Navigation, lesson 2")).toBeInTheDocument();
    expect(screen.getByText("2 to catch up")).toBeInTheDocument();
    expect(screen.getByText(/Ran 12 Oct.*\(A, B\)/)).toBeInTheDocument();
    expect(screen.getByText("Everyone's had it")).toBeInTheDocument();
  });

  it("opens a lesson to show who needs it and who was in but didn't scan", async () => {
    api(ROWS);
    renderWithQuery(<CatchUps />);
    await userEvent.click(
      await screen.findByRole("button", { name: /catch-ups for Basic Navigation, lesson 2/ })
    );
    const able = screen.getByRole("link", { name: "Cadet Amy Able" });
    expect(able).toHaveAttribute("href", "/cadets/1");
    expect(within(able.closest("li")!).getByText(/missed the scan/)).toBeInTheDocument();
    const orsted = screen.getByRole("link", { name: "Zoë Ørsted" });
    expect(within(orsted.closest("li")!).queryByText(/missed the scan/)).not.toBeInTheDocument();
  });

  it("narrows to one flight", async () => {
    api(ROWS);
    renderWithQuery(<CatchUps />);
    await userEvent.click(await screen.findByRole("radio", { name: "B Flight" }));
    expect(screen.getByText("1 to catch up")).toBeInTheDocument();
  });

  it("points to the programme links when nothing is linked yet", async () => {
    api([]);
    renderWithQuery(<CatchUps />);
    expect(await screen.findByText("No lessons on the programme to catch up on")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Programme links" })).toHaveAttribute("href", "/training/links");
  });

  it("shows the API's error instead of crashing on an error body", async () => {
    api({ detail: "Database is down" }, 500);
    renderWithQuery(<CatchUps />);
    expect(await screen.findByText("Database is down")).toBeInTheDocument();
  });
});
