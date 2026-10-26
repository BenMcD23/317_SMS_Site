// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok", role: "staff", user: { email: "s@x" } }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ box: "a" }), useRouter: () => ({ push: vi.fn() }) }));

import BoxPage from "@/app/stores/uniform/stock/[box]/page";
import { renderWithQuery } from "@/tests/render-with-query";

const STRUCTURE = {
  boxes: [
    {
      label: "A",
      shelfLevel: 1,
      shelfPosition: 0,
      boxWidth: 1,
      topEnd: "left",
      sections: [{ label: "1", position: 0, row: 0, sectionWidth: 1 }],
    },
  ],
};

function stubApi(structure: () => Response, stock = () => new Response("[]", { status: 200 })) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => (url === "/api/stores/structure" ? structure() : stock()))
  );
}

describe("Stock box page", () => {
  it("shows the box named in the URL", async () => {
    stubApi(() => new Response(JSON.stringify(STRUCTURE), { status: 200 }));
    renderWithQuery(<BoxPage />);
    expect(await screen.findByRole("heading", { name: "Box A" })).toBeInTheDocument();
  });

  it("says a box doesn't exist only when the shelves loaded without it", async () => {
    stubApi(() => new Response(JSON.stringify({ boxes: [] }), { status: 200 }));
    renderWithQuery(<BoxPage />);
    expect(await screen.findByText(/Box A not found/)).toBeInTheDocument();
  });

  it("a failed load is an error, not 'box not found'", async () => {
    stubApi(() => new Response(JSON.stringify({ error: "API unreachable" }), { status: 503 }));
    renderWithQuery(<BoxPage />);
    expect(await screen.findByText("API unreachable")).toBeInTheDocument();
    expect(screen.queryByText(/not found/)).toBeNull();
  });
});
