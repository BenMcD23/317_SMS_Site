// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import CadetEventListPage from "@/app/cadets/events/page";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk", name: "Sam Staff" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const EVENTS = [
  { id: 1, title: "Wing March", category: "Road Marching", cadet_count: 0, cadets: [], sub_apps: [] },
  { id: 2, title: "Camp", category: null, cadet_count: 0, cadets: [], sub_apps: [] },
];

function stubApi() {
  // A fresh Response per call — a body can only be read once.
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(new Response(JSON.stringify(url.endsWith("/bans") ? [] : EVENTS), { status: 200 }))
    )
  );
}

describe("Events page", () => {
  it("shows each event's Bader category, and nothing for one it couldn't read", async () => {
    stubApi();
    renderWithQuery(<CadetEventListPage />);
    expect(await screen.findByText("Road Marching")).toBeTruthy();
    expect(screen.getByText("Camp")).toBeTruthy();
  });

  it("search matches on category", async () => {
    stubApi();
    renderWithQuery(<CadetEventListPage />);
    await screen.findByText("Wing March");
    await userEvent.type(screen.getByPlaceholderText(/Search/), "road march");
    expect(screen.getByText("Wing March")).toBeTruthy();
    expect(screen.queryByText("Camp")).toBeNull();
  });
});
